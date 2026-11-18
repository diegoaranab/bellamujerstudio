import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ClubClient, LoyaltyLedgerEntry, LoyaltyLedgerType } from '../club/club-model';
import {
  ClubLedgerContinuationKey,
  ClubLedgerListPage,
  DynamoClubPersistence
} from '../club/club-persistence';
import { extractMemberAuthorizerContext } from '../club-access/member-authorizer-context';

export const DEFAULT_MEMBER_CLUB_HISTORY_LIMIT = 20;
export const MAX_MEMBER_CLUB_HISTORY_LIMIT = 50;

export interface MemberClubHistoryItem {
  occurredAtISO: string;
  type: LoyaltyLedgerType;
  stampDelta: number;
  stampCountAfter: number;
}

export interface MemberClubHistoryPersistence {
  getClient(studioId: string, clientId: string): Promise<ClubClient | undefined>;
  listLedgerEntries(
    studioId: string,
    clientId: string,
    limit: number,
    exclusiveStartKey?: ClubLedgerContinuationKey
  ): Promise<ClubLedgerListPage>;
}

export interface MemberClubHistoryDependencies {
  persistence: MemberClubHistoryPersistence;
}

const jsonResponse = (statusCode: number, body: object): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body)
});

const failureResponse = (): APIGatewayProxyStructuredResultV2 => jsonResponse(500, {
  error: 'SERVER_ERROR',
  message: 'No pudimos cargar tu historial de Bella Mujer Club. Intenta de nuevo en unos minutos.'
});

const partition = (studioId: string, clientId: string): string =>
  `STUDIO#${studioId}#CLIENT#${clientId}`;

const validKey = (
  value: unknown,
  studioId: string,
  clientId: string
): value is ClubLedgerContinuationKey => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'pk,sk') return false;
  const pk = record.pk as Record<string, unknown> | undefined;
  const sk = record.sk as Record<string, unknown> | undefined;
  if (!pk || !sk || Object.keys(pk).join(',') !== 'S' || Object.keys(sk).join(',') !== 'S') {
    return false;
  }
  return pk.S === partition(studioId, clientId) && typeof sk.S === 'string' &&
    sk.S.startsWith('LEDGER#') && sk.S.length > 'LEDGER#'.length &&
    Buffer.byteLength(sk.S, 'utf8') <= 1024;
};

const decodeToken = (
  token: string,
  studioId: string,
  clientId: string
): ClubLedgerContinuationKey => {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('Malformed token');
  const decoded = Buffer.from(token, 'base64url');
  if (decoded.length > 4096 || decoded.toString('base64url') !== token) throw new Error('Malformed token');
  const parsed: unknown = JSON.parse(decoded.toString('utf8'));
  if (!validKey(parsed, studioId, clientId)) throw new Error('Invalid token');
  return parsed;
};

const encodeToken = (key: ClubLedgerContinuationKey, studioId: string, clientId: string): string => {
  if (!validKey(key, studioId, clientId)) throw new Error('Unsafe continuation key');
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
};

const parseLimit = (raw: string | undefined): number => {
  if (raw === undefined) return DEFAULT_MEMBER_CLUB_HISTORY_LIMIT;
  if (!/^[0-9]+$/.test(raw)) throw new Error('Malformed limit');
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_MEMBER_CLUB_HISTORY_LIMIT) {
    throw new Error('Invalid limit');
  }
  return limit;
};

const project = (entry: LoyaltyLedgerEntry): MemberClubHistoryItem => ({
  occurredAtISO: entry.occurredAtISO,
  type: entry.type,
  stampDelta: entry.stampDelta,
  stampCountAfter: entry.stampCountAfter
});

const logFailure = (operation: string, event: APIGatewayProxyEventV2, error?: unknown): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? error.$metadata as { requestId?: unknown; httpStatusCode?: unknown }
    : undefined;
  console.error('Club member history operation failed', {
    operation,
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode } : {})
  });
};

export const createMemberClubHistoryHandler = ({ persistence }: MemberClubHistoryDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    let studioId: string;
    let clientId: string;
    try {
      ({ studioId, clientId } = extractMemberAuthorizerContext(event));
    } catch (error) {
      logFailure('get-member-history', event, error);
      return failureResponse();
    }

    let limit: number;
    let startKey: ClubLedgerContinuationKey | undefined;
    try {
      limit = parseLimit(event.queryStringParameters?.limit);
      const token = event.queryStringParameters?.nextToken;
      startKey = token === undefined ? undefined : decodeToken(token, studioId, clientId);
    } catch {
      return jsonResponse(400, {
        error: 'VALIDATION_ERROR',
        message: 'La solicitud no es válida.'
      });
    }

    try {
      const client = await persistence.getClient(studioId, clientId);
      if (!client) {
        logFailure('invalid-member-club-aggregate', event);
        return failureResponse();
      }
      const page = await persistence.listLedgerEntries(studioId, clientId, limit, startKey);
      return jsonResponse(200, {
        items: page.items.map(project),
        ...(page.lastEvaluatedKey
          ? { nextToken: encodeToken(page.lastEvaluatedKey, studioId, clientId) }
          : {})
      });
    } catch (error) {
      logFailure('get-member-history', event, error);
      return failureResponse();
    }
  };

const tableName = process.env.CLUB_TABLE_NAME;
if (!tableName) console.warn('CLUB_TABLE_NAME is not configured.');
const unavailable = async (): Promise<never> => {
  throw new Error('Club member history is not configured');
};
const persistence: MemberClubHistoryPersistence = tableName
  ? new DynamoClubPersistence(new DynamoDBClient({}), tableName)
  : { getClient: unavailable, listLedgerEntries: unavailable };

export const handler = createMemberClubHistoryHandler({ persistence });
