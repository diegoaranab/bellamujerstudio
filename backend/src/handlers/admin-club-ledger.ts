import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ClubClient } from '../club/club-model';
import {
  ClubLedgerContinuationKey,
  ClubLedgerListPage,
  DynamoClubPersistence
} from '../club/club-persistence';
import { originsFromEnvironment } from '../shared/frontend-configuration';
import { jsonResponse, validationErrorResponse } from '../shared/response';

export const DEFAULT_CLUB_LEDGER_LIMIT = 50;
export const MAX_CLUB_LEDGER_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ClubLedgerReadPersistence {
  getClient(studioId: string, clientId: string): Promise<ClubClient | undefined>;
  listLedgerEntries(
    studioId: string,
    clientId: string,
    limit: number,
    exclusiveStartKey?: ClubLedgerContinuationKey
  ): Promise<ClubLedgerListPage>;
}

export interface AdminClubLedgerHandlerDependencies {
  persistence: ClubLedgerReadPersistence;
  studioId: string;
  allowedOrigins?: readonly string[];
}

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
  if (raw === undefined) return DEFAULT_CLUB_LEDGER_LIMIT;
  if (!/^[0-9]+$/.test(raw)) throw new Error('Malformed limit');
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CLUB_LEDGER_LIMIT) {
    throw new Error('Invalid limit');
  }
  return limit;
};

const logFailure = (event: APIGatewayProxyEventV2, error?: unknown): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? error.$metadata as { requestId?: unknown; httpStatusCode?: unknown }
    : undefined;
  console.error('Administrative Club ledger read failed', {
    operation: 'list-ledger',
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode } : {})
  });
};

export const createAdminClubLedgerHandler = ({
  persistence,
  studioId,
  allowedOrigins = originsFromEnvironment()
}: AdminClubLedgerHandlerDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers.origin;
    const rawId = event.pathParameters?.id;
    if (!rawId || !UUID.test(rawId)) return validationErrorResponse(origin, allowedOrigins);
    const clientId = rawId.toLowerCase();
    let limit: number;
    let startKey: ClubLedgerContinuationKey | undefined;
    try {
      limit = parseLimit(event.queryStringParameters?.limit);
      const token = event.queryStringParameters?.nextToken;
      startKey = token === undefined ? undefined : decodeToken(token, studioId, clientId);
    } catch {
      return validationErrorResponse(origin, allowedOrigins);
    }

    try {
      const client = await persistence.getClient(studioId, clientId);
      if (!client) return jsonResponse(404, {
        error: 'CLUB_CLIENT_NOT_FOUND',
        message: 'No encontramos la clienta de Bella Mujer Club solicitada.'
      }, origin, allowedOrigins);
      const page = await persistence.listLedgerEntries(studioId, clientId, limit, startKey);
      return jsonResponse(200, {
        items: page.items,
        ...(page.lastEvaluatedKey
          ? { nextToken: encodeToken(page.lastEvaluatedKey, studioId, clientId) }
          : {})
      }, origin, allowedOrigins);
    } catch (error) {
      logFailure(event, error);
      return jsonResponse(500, {
        error: 'SERVER_ERROR',
        message: 'No pudimos cargar el historial de Bella Mujer Club. Intenta de nuevo en unos minutos.'
      }, origin, allowedOrigins);
    }
  };

const tableName = process.env.CLUB_TABLE_NAME;
const studioId = process.env.CLUB_STUDIO_ID;
if (!tableName) console.warn('CLUB_TABLE_NAME is not configured.');
if (!studioId) console.warn('CLUB_STUDIO_ID is not configured.');
const unavailable = async (): Promise<never> => { throw new Error('Club table is not configured'); };
const runtimePersistence: ClubLedgerReadPersistence = tableName
  ? new DynamoClubPersistence(new DynamoDBClient({}), tableName)
  : { getClient: unavailable, listLedgerEntries: unavailable };

export const handler = createAdminClubLedgerHandler({
  persistence: runtimePersistence,
  studioId: studioId ?? ''
});
