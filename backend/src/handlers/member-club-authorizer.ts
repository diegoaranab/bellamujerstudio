import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerResult,
  APIGatewaySimpleAuthorizerWithContextResult
} from 'aws-lambda';
import { digestSecret, validateCanonicalOpaqueToken } from '../club-access/club-access-crypto';
import { AccessSession, MemberAccessState } from '../club-access/club-access-model';
import { DynamoClubAccessPersistence } from '../club-access/club-access-persistence';
import { Clock, currentDate } from '../shared/time';

export interface MemberAuthorizerPersistence {
  getSession(sessionDigest: string): Promise<AccessSession | undefined>;
  getMemberAccess(clientId: string): Promise<MemberAccessState | undefined>;
}

export interface MemberClubAuthorizerDependencies {
  persistence: MemberAuthorizerPersistence;
  clock?: Clock;
}

export interface MemberClubAuthorizerContext {
  studioId: string;
  clientId: string;
}

export type MemberClubAuthorizerResult =
  | APIGatewaySimpleAuthorizerResult
  | APIGatewaySimpleAuthorizerWithContextResult<MemberClubAuthorizerContext>;

const DENIED: APIGatewaySimpleAuthorizerResult = Object.freeze({ isAuthorized: false });

const bearerToken = (event: APIGatewayRequestAuthorizerEventV2): string | undefined => {
  const authorization = event.headers?.authorization ?? event.headers?.Authorization;
  if (typeof authorization !== 'string') return undefined;
  const match = /^Bearer ([A-Za-z0-9_-]+)$/i.exec(authorization);
  if (!match) return undefined;
  try {
    return validateCanonicalOpaqueToken(match[1]);
  } catch {
    return undefined;
  }
};

const serverTime = (clock: Clock): Date => {
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error('Invalid member authorizer clock');
  }
  return now;
};

const isCurrentSession = (session: AccessSession, now: Date): boolean => {
  const expiresAt = new Date(session.expiresAtISO).getTime();
  if (!Number.isFinite(expiresAt)) throw new Error('Invalid persisted session expiry');
  return !session.revoked && session.revokedAtISO === undefined && now.getTime() < expiresAt;
};

const matchesActiveMember = (session: AccessSession, state: MemberAccessState): boolean =>
  state.studioId === session.studioId &&
  state.clientId === session.clientId &&
  state.accessStatus === 'active' &&
  state.credentialVersion === session.credentialVersion &&
  state.pinVerifier !== undefined;

const logFailure = (event: APIGatewayRequestAuthorizerEventV2, error: unknown): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? error.$metadata as { requestId?: unknown; httpStatusCode?: unknown }
    : undefined;
  console.error('Club member authorization operation failed', {
    operation: 'authorize-member-session',
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode } : {})
  });
};

export const createMemberClubAuthorizerHandler = ({
  persistence,
  clock = currentDate
}: MemberClubAuthorizerDependencies) =>
  async (event: APIGatewayRequestAuthorizerEventV2): Promise<MemberClubAuthorizerResult> => {
    const token = bearerToken(event);
    if (!token) return DENIED;

    try {
      const session = await persistence.getSession(digestSecret(token));
      if (!session || !isCurrentSession(session, serverTime(clock))) return DENIED;

      const state = await persistence.getMemberAccess(session.clientId);
      if (!state || !matchesActiveMember(session, state)) return DENIED;

      return {
        isAuthorized: true,
        context: {
          studioId: session.studioId,
          clientId: session.clientId
        }
      };
    } catch (error) {
      logFailure(event, error);
      throw error;
    }
  };

const accessTableName = process.env.CLUB_ACCESS_TABLE_NAME;
if (!accessTableName) console.warn('CLUB_ACCESS_TABLE_NAME is not configured.');
const unavailable = async (): Promise<never> => {
  throw new Error('Club member authorizer is not configured');
};
const persistence = accessTableName
  ? new DynamoClubAccessPersistence(new DynamoDBClient({}), accessTableName)
  : { getSession: unavailable, getMemberAccess: unavailable };

export const handler = createMemberClubAuthorizerHandler({ persistence });
