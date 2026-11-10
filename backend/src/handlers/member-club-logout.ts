import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { digestSecret, validateCanonicalOpaqueToken } from '../club-access/club-access-crypto';
import { AccessSession } from '../club-access/club-access-model';
import { DynamoClubAccessPersistence } from '../club-access/club-access-persistence';
import { originsFromEnvironment } from '../shared/frontend-configuration';
import { serverErrorResponse } from '../shared/response';
import { Clock, currentDate } from '../shared/time';

export interface MemberLogoutPersistence {
  getSession(sessionDigest: string): Promise<AccessSession | undefined>;
  revokeSession(expected: AccessSession, next: AccessSession): Promise<void>;
}

export interface MemberClubLogoutDependencies {
  persistence: MemberLogoutPersistence;
  clock?: Clock;
  allowedOrigins?: readonly string[];
}

const bearerToken = (event: APIGatewayProxyEventV2): string | undefined => {
  const authorization = event.headers.authorization ?? event.headers.Authorization;
  if (typeof authorization !== 'string') return undefined;
  const match = /^Bearer ([A-Za-z0-9_-]+)$/i.exec(authorization);
  if (!match) return undefined;
  try {
    return validateCanonicalOpaqueToken(match[1]);
  } catch {
    return undefined;
  }
};

const noContent = (origin: string | undefined, allowedOrigins: readonly string[]) => {
  const allowed = !!origin && allowedOrigins.includes(origin);
  return {
    statusCode: 204,
    headers: {
      ...(allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {})
    }
  };
};

const transactionConflict = (error: unknown): boolean => {
  if (!error || typeof error !== 'object' || !('name' in error) ||
    error.name !== 'TransactionCanceledException' || !('CancellationReasons' in error) ||
    !Array.isArray(error.CancellationReasons) || error.CancellationReasons.length === 0) {
    return false;
  }
  const codes = error.CancellationReasons.map((reason) =>
    reason && typeof reason === 'object' && 'Code' in reason && typeof reason.Code === 'string'
      ? reason.Code
      : undefined
  );
  return codes.some((code) => code === 'ConditionalCheckFailed' || code === 'TransactionConflict') &&
    codes.every((code) => code === 'None' || code === 'ConditionalCheckFailed' ||
      code === 'TransactionConflict');
};

const logFailure = (event: APIGatewayProxyEventV2, error: unknown): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? error.$metadata as { requestId?: unknown; httpStatusCode?: unknown }
    : undefined;
  console.error('Club member logout operation failed', {
    operation: 'logout',
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode } : {})
  });
};

export const createMemberClubLogoutHandler = ({
  persistence,
  clock = currentDate,
  allowedOrigins = originsFromEnvironment()
}: MemberClubLogoutDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers.origin;
    const token = bearerToken(event);
    if (!token) return noContent(origin, allowedOrigins);

    try {
      const session = await persistence.getSession(digestSecret(token));
      const now = clock();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new Error('Invalid member logout clock');
      }
      if (!session || session.revoked ||
        new Date(session.expiresAtISO).getTime() <= now.getTime()) {
        return noContent(origin, allowedOrigins);
      }
      const next: AccessSession = {
        ...session,
        revoked: true,
        revokedAtISO: now.toISOString()
      };
      try {
        await persistence.revokeSession(session, next);
      } catch (error) {
        if (!transactionConflict(error)) throw error;
      }
      return noContent(origin, allowedOrigins);
    } catch (error) {
      logFailure(event, error);
      return serverErrorResponse(origin, allowedOrigins);
    }
  };

const accessTableName = process.env.CLUB_ACCESS_TABLE_NAME;
if (!accessTableName) console.warn('CLUB_ACCESS_TABLE_NAME is not configured.');
const unavailable = async (): Promise<never> => {
  throw new Error('Club member logout is not configured');
};
const persistence = accessTableName
  ? new DynamoClubAccessPersistence(new DynamoDBClient({}), accessTableName)
  : { getSession: unavailable, revokeSession: unavailable };

export const handler = createMemberClubLogoutHandler({ persistence });
