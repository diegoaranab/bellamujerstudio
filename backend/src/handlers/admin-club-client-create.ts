import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ClubClient, LoyaltyBalance } from '../club/club-model';
import { DynamoClubPersistence } from '../club/club-persistence';
import { originsFromEnvironment } from '../shared/frontend-configuration';
import { createClubClientId } from '../shared/id';
import { jsonResponse, payloadTooLargeResponse, validationErrorResponse } from '../shared/response';
import { Clock, currentDate, currentISO } from '../shared/time';

export const MAX_CLUB_CLIENT_CREATE_BODY_BYTES = 4 * 1024;

export interface ClubClientCreatePersistence {
  createClient(client: ClubClient, initialBalance: LoyaltyBalance): Promise<void>;
}

export interface AdminClubClientCreateHandlerDependencies {
  persistence: ClubClientCreatePersistence;
  studioId: string;
  clock?: Clock;
  createClientId?: () => string;
  allowedOrigins?: readonly string[];
}

interface CreateClubClientRequest {
  name: string;
  phone: string;
}

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

const bodySize = (body: string | undefined, isBase64Encoded?: boolean): number =>
  body ? Buffer.byteLength(body, isBase64Encoded ? 'base64' : 'utf8') : 0;

const normalizedField = (value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') throw new TypeError('Invalid field');
  const normalized = value.trim();
  if (!normalized || Array.from(normalized).length > maxLength || CONTROL_CHARACTER.test(normalized)) {
    throw new TypeError('Invalid field');
  }
  return normalized;
};

const parseRequest = (body: string | undefined, isBase64Encoded?: boolean): CreateClubClientRequest => {
  if (!body) throw new SyntaxError('Missing JSON body');
  const json = isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Body must be an object');
  }
  const input = parsed as Record<string, unknown>;
  const keys = Object.keys(input).sort();
  if (keys.length !== 2 || keys[0] !== 'name' || keys[1] !== 'phone') {
    throw new TypeError('Body contains invalid keys');
  }
  return {
    name: normalizedField(input.name, 200),
    phone: normalizedField(input.phone, 50)
  };
};

const logPersistenceFailure = (event: APIGatewayProxyEventV2, error: unknown): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? (error.$metadata as { requestId?: unknown; httpStatusCode?: unknown })
    : undefined;
  console.error('Administrative Club client creation failed', {
    operation: 'create-client',
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode }
      : {})
  });
};

export const createAdminClubClientCreateHandler = ({
  persistence,
  studioId,
  clock = currentDate,
  createClientId = createClubClientId,
  allowedOrigins = originsFromEnvironment()
}: AdminClubClientCreateHandlerDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers.origin;
    if (bodySize(event.body, event.isBase64Encoded) > MAX_CLUB_CLIENT_CREATE_BODY_BYTES) {
      return payloadTooLargeResponse(origin, allowedOrigins);
    }

    let request: CreateClubClientRequest;
    try {
      request = parseRequest(event.body, event.isBase64Encoded);
    } catch {
      return validationErrorResponse(origin, allowedOrigins);
    }

    const clientId = createClientId().toLowerCase();
    const nowISO = currentISO(clock);
    const client: ClubClient = {
      studioId,
      clientId,
      name: request.name,
      phone: request.phone,
      status: 'active',
      createdAtISO: nowISO,
      updatedAtISO: nowISO
    };
    const balance: LoyaltyBalance = {
      studioId,
      clientId,
      stampCount: 0,
      eligibleSpendCarryMXN: 0,
      version: 0,
      updatedAtISO: nowISO
    };

    try {
      await persistence.createClient(client, balance);
      return jsonResponse(201, { client, balance }, origin, allowedOrigins);
    } catch (error) {
      logPersistenceFailure(event, error);
      return jsonResponse(500, {
        error: 'SERVER_ERROR',
        message: 'No pudimos crear la clienta de Bella Mujer Club. Intenta de nuevo en unos minutos.'
      }, origin, allowedOrigins);
    }
  };

const tableName = process.env.CLUB_TABLE_NAME;
const studioId = process.env.CLUB_STUDIO_ID;
if (!tableName) console.warn('CLUB_TABLE_NAME is not configured.');
if (!studioId) console.warn('CLUB_STUDIO_ID is not configured.');

const runtimePersistence: ClubClientCreatePersistence = tableName
  ? new DynamoClubPersistence(new DynamoDBClient({}), tableName)
  : { createClient: async () => { throw new Error('Club table is not configured'); } };

export const handler = createAdminClubClientCreateHandler({
  persistence: runtimePersistence,
  studioId: studioId ?? ''
});
