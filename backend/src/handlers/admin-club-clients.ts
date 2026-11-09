import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ClubClient, LoyaltyBalance } from '../club/club-model';
import {
  ClubClientContinuationKey,
  ClubClientListPage,
  DynamoClubPersistence
} from '../club/club-persistence';
import { originsFromEnvironment } from '../shared/frontend-configuration';
import { jsonResponse, validationErrorResponse } from '../shared/response';

export const DEFAULT_CLUB_CLIENT_LIMIT = 50;
export const MAX_CLUB_CLIENT_LIMIT = 100;

export interface ClubClientsReadPersistence {
  listClients(
    studioId: string,
    limit: number,
    exclusiveStartKey?: ClubClientContinuationKey
  ): Promise<ClubClientListPage>;
  getClient(studioId: string, clientId: string): Promise<ClubClient | undefined>;
  getBalance(studioId: string, clientId: string): Promise<LoyaltyBalance | undefined>;
}

export interface AdminClubClientsHandlerDependencies {
  persistence: ClubClientsReadPersistence;
  studioId: string;
  allowedOrigins?: readonly string[];
}

const validUUID = (value: string | undefined): value is string =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const parseLimit = (value: string | undefined): number => {
  if (value === undefined) return DEFAULT_CLUB_CLIENT_LIMIT;
  if (!/^[0-9]+$/.test(value)) throw new Error('Malformed limit');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_CLUB_CLIENT_LIMIT) {
    throw new Error('Limit out of range');
  }
  return parsed;
};

const expectedPartition = (studioId: string): string => `STUDIO#${studioId}`;

const validContinuationKey = (
  value: unknown,
  studioId: string
): value is ClubClientContinuationKey => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'pk,sk') return false;
  const pk = record.pk as Record<string, unknown> | undefined;
  const sk = record.sk as Record<string, unknown> | undefined;
  if (!pk || !sk || Object.keys(pk).join(',') !== 'S' || Object.keys(sk).join(',') !== 'S') {
    return false;
  }
  return pk.S === expectedPartition(studioId) &&
    typeof sk.S === 'string' && sk.S.startsWith('CLIENT#') && sk.S.length > 'CLIENT#'.length &&
    Buffer.byteLength(sk.S, 'utf8') <= 1024;
};

const decodeNextToken = (token: string, studioId: string): ClubClientContinuationKey => {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('Malformed pagination token');
  const decoded = Buffer.from(token, 'base64url');
  if (decoded.toString('base64url') !== token || decoded.length > 4096) {
    throw new Error('Malformed pagination token');
  }
  const value: unknown = JSON.parse(decoded.toString('utf8'));
  if (!validContinuationKey(value, studioId)) throw new Error('Invalid continuation key');
  return value;
};

const encodeNextToken = (key: ClubClientContinuationKey, studioId: string): string => {
  if (!validContinuationKey(key, studioId)) throw new Error('Unsafe continuation key');
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
};

const logReadFailure = (
  operation: 'list-clients' | 'get-client-detail' | 'invalid-client-aggregate',
  event: APIGatewayProxyEventV2,
  error?: unknown
): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? (error.$metadata as { requestId?: unknown; httpStatusCode?: unknown })
    : undefined;
  console.error('Administrative Club client read failed', {
    operation,
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode }
      : {})
  });
};

export const createAdminClubClientsHandler = ({
  persistence,
  studioId,
  allowedOrigins = originsFromEnvironment()
}: AdminClubClientsHandlerDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers.origin;
    const isDetail = event.routeKey === 'GET /admin/club/clients/{id}' ||
      event.pathParameters?.id !== undefined;

    if (isDetail) {
      const id = event.pathParameters?.id;
      if (!validUUID(id)) return validationErrorResponse(origin, allowedOrigins);
      const clientId = id.toLowerCase();
      try {
        const client = await persistence.getClient(studioId, clientId);
        if (!client) {
          return jsonResponse(404, {
            error: 'CLUB_CLIENT_NOT_FOUND',
            message: 'No encontramos la clienta de Bella Mujer Club solicitada.'
          }, origin, allowedOrigins);
        }
        const balance = await persistence.getBalance(studioId, clientId);
        if (!balance) {
          logReadFailure('invalid-client-aggregate', event);
          return jsonResponse(500, {
            error: 'SERVER_ERROR',
            message: 'No pudimos cargar la clienta de Bella Mujer Club. Intenta de nuevo en unos minutos.'
          }, origin, allowedOrigins);
        }
        return jsonResponse(200, { client, balance }, origin, allowedOrigins);
      } catch (error) {
        logReadFailure('get-client-detail', event, error);
        return jsonResponse(500, {
          error: 'SERVER_ERROR',
          message: 'No pudimos cargar la clienta de Bella Mujer Club. Intenta de nuevo en unos minutos.'
        }, origin, allowedOrigins);
      }
    }

    let limit: number;
    let exclusiveStartKey: ClubClientContinuationKey | undefined;
    try {
      limit = parseLimit(event.queryStringParameters?.limit);
      const token = event.queryStringParameters?.nextToken;
      exclusiveStartKey = token === undefined ? undefined : decodeNextToken(token, studioId);
    } catch {
      return jsonResponse(400, {
        error: 'VALIDATION_ERROR',
        message: 'Los parámetros de paginación no son válidos.'
      }, origin, allowedOrigins);
    }

    try {
      const page = await persistence.listClients(studioId, limit, exclusiveStartKey);
      return jsonResponse(200, {
        items: page.items,
        ...(page.lastEvaluatedKey
          ? { nextToken: encodeNextToken(page.lastEvaluatedKey, studioId) }
          : {})
      }, origin, allowedOrigins);
    } catch (error) {
      logReadFailure('list-clients', event, error);
      return jsonResponse(500, {
        error: 'SERVER_ERROR',
        message: 'No pudimos cargar las clientas de Bella Mujer Club. Intenta de nuevo en unos minutos.'
      }, origin, allowedOrigins);
    }
  };

const tableName = process.env.CLUB_TABLE_NAME;
const studioId = process.env.CLUB_STUDIO_ID;
if (!tableName) console.warn('CLUB_TABLE_NAME is not configured.');
if (!studioId) console.warn('CLUB_STUDIO_ID is not configured.');

const unavailable = async (): Promise<never> => { throw new Error('Club table is not configured'); };
const runtimePersistence: ClubClientsReadPersistence = tableName
  ? new DynamoClubPersistence(new DynamoDBClient({}), tableName)
  : { listClients: unavailable, getClient: unavailable, getBalance: unavailable };

export const handler = createAdminClubClientsHandler({
  persistence: runtimePersistence,
  studioId: studioId ?? ''
});
