import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ClubClient, LoyaltyLedgerEntry, LoyaltyLedgerType } from '../club/club-model';
import {
  ClubLedgerContinuationKey,
  ClubLedgerListPage,
  DynamoClubPersistence
} from '../club/club-persistence';
import { extractMemberAuthorizerContext } from '../club-access/member-authorizer-context';
import {
  EncryptedMemberHistoryCursorCodec,
  MemberHistoryCursorCodec
} from '../club/member-history-cursor';
import { createRuntimeMemberHistoryCursorSecretProvider } from '../club/member-history-cursor-secret';

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
  cursorCodec: MemberHistoryCursorCodec;
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

export const createMemberClubHistoryHandler = ({ persistence, cursorCodec }: MemberClubHistoryDependencies) =>
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
      startKey = token === undefined ? undefined : await cursorCodec.decode(token, studioId, clientId);
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
          ? { nextToken: await cursorCodec.encode(page.lastEvaluatedKey, studioId, clientId) }
          : {})
      });
    } catch (error) {
      logFailure('get-member-history', event, error);
      return failureResponse();
    }
  };

const tableName = process.env.CLUB_TABLE_NAME;
const cursorSecretArn = process.env.CLUB_HISTORY_CURSOR_SECRET_ARN;
const cursorVersion = process.env.CLUB_HISTORY_CURSOR_VERSION ?? 'v1';
if (!tableName) console.warn('CLUB_TABLE_NAME is not configured.');
if (!cursorSecretArn) console.warn('CLUB_HISTORY_CURSOR_SECRET_ARN is not configured.');
const unavailable = async (): Promise<never> => {
  throw new Error('Club member history is not configured');
};
const persistence: MemberClubHistoryPersistence = tableName
  ? new DynamoClubPersistence(new DynamoDBClient({}), tableName)
  : { getClient: unavailable, listLedgerEntries: unavailable };

const cursorCodec = cursorSecretArn
  ? new EncryptedMemberHistoryCursorCodec(
    createRuntimeMemberHistoryCursorSecretProvider(cursorSecretArn), cursorVersion
  )
  : undefined;

export const handler = createMemberClubHistoryHandler({
  persistence,
  cursorCodec: cursorCodec ?? {
    encode: async () => { throw new Error('Member history cursor is not configured'); },
    decode: async () => { throw new Error('Member history cursor is not configured'); }
  }
});
