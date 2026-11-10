import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
  derivePinVerifier,
  digestSecret,
  generateSessionToken,
  isValidSixDigitPin,
  validateCanonicalOpaqueToken,
  verifyPin
} from '../club-access/club-access-crypto';
import { createSessionRecord, failedPinTransition } from '../club-access/club-access-auth';
import {
  AccessInvitation,
  AccessSession,
  HandleLookup,
  MemberAccessState,
  PinVerifierMetadata
} from '../club-access/club-access-model';
import { DynamoClubAccessPersistence } from '../club-access/club-access-persistence';
import {
  PinPepperProvider,
  createRuntimePinPepperProvider
} from '../club-access/club-pin-pepper';
import { originsFromEnvironment } from '../shared/frontend-configuration';
import {
  jsonResponse,
  payloadTooLargeResponse,
  serverErrorResponse,
  validationErrorResponse
} from '../shared/response';
import { Clock, currentDate } from '../shared/time';

export const MEMBER_AUTH_MAX_REQUEST_BODY_BYTES = 1024;
export const FAILED_PIN_CAS_ATTEMPTS = 4;

export interface MemberAuthPersistence {
  getHandleLookup(handleDigest: string): Promise<HandleLookup | undefined>;
  getInvitation(invitationDigest: string): Promise<AccessInvitation | undefined>;
  getMemberAccess(clientId: string): Promise<MemberAccessState | undefined>;
  completeEnrollment(
    expectedState: MemberAccessState,
    expectedLookup: HandleLookup,
    expectedInvitation: AccessInvitation,
    nextState: MemberAccessState,
    nextLookup: HandleLookup,
    consumedInvitation: AccessInvitation,
    session: AccessSession,
    commitAtISO: string
  ): Promise<void>;
  recordFailedPinAttempt(expected: MemberAccessState, next: MemberAccessState): Promise<void>;
  completeSuccessfulLogin(
    expected: MemberAccessState,
    next: MemberAccessState,
    session: AccessSession
  ): Promise<void>;
}

export interface MemberAuthCrypto {
  derive(
    pin: string,
    pepper: string,
    options: { pepperVersion: string; now: Date }
  ): Promise<PinVerifierMetadata>;
  verify(
    pin: string,
    pepper: string,
    verifier: PinVerifierMetadata,
    options: { pepperVersion: string }
  ): Promise<boolean>;
}

export interface MemberClubAuthDependencies {
  persistence: MemberAuthPersistence;
  pepperProvider: PinPepperProvider;
  pepperVersion: string;
  clock?: Clock;
  sessionTokenGenerator?: () => string;
  crypto?: MemberAuthCrypto;
  allowedOrigins?: readonly string[];
}

type EnrollmentBody = { accessHandle: string; invitationToken: string; pin: string };
type LoginBody = { accessHandle: string; pin: string };
type Operation = 'enroll' | 'login';

const parseExactBody = <T extends Record<string, string>>(
  event: APIGatewayProxyEventV2,
  keys: readonly string[]
): T | undefined => {
  if (!event.body) return undefined;
  try {
    const text = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join('|') !== [...keys].sort().join('|') ||
      keys.some((key) => typeof record[key] !== 'string')) return undefined;
    return record as T;
  } catch {
    return undefined;
  }
};

const bodySize = (event: APIGatewayProxyEventV2): number =>
  event.body ? Buffer.byteLength(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : 0;

const validDate = (clock: Clock): Date => {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error('Invalid member authentication clock');
  }
  return value;
};

const sameVerifier = (left: PinVerifierMetadata | undefined, right: PinVerifierMetadata | undefined) =>
  JSON.stringify(left) === JSON.stringify(right);

const sameCredential = (expected: MemberAccessState, current: MemberAccessState): boolean =>
  current.studioId === expected.studioId && current.clientId === expected.clientId &&
  current.handleDigest === expected.handleDigest && current.accessStatus === 'active' &&
  current.credentialVersion === expected.credentialVersion &&
  current.invitationGeneration === expected.invitationGeneration &&
  current.pinVerifier !== undefined && sameVerifier(current.pinVerifier, expected.pinVerifier);

const validActiveAggregate = (
  lookup: HandleLookup | undefined,
  state: MemberAccessState | undefined,
  handleDigest: string
): state is MemberAccessState => !!lookup && !!state &&
  lookup.handleDigest === handleDigest && state.handleDigest === handleDigest &&
  lookup.studioId === state.studioId && lookup.clientId === state.clientId &&
  lookup.accessStatus === 'active' && state.accessStatus === 'active' &&
  lookup.credentialVersion === state.credentialVersion && state.pinVerifier !== undefined;

const validInvitationAggregate = (
  lookup: HandleLookup | undefined,
  invitation: AccessInvitation | undefined,
  state: MemberAccessState | undefined,
  handleDigest: string,
  invitationDigest: string,
  now: Date
): state is MemberAccessState => !!lookup && !!invitation && !!state &&
  lookup.handleDigest === handleDigest && invitation.invitationDigest === invitationDigest &&
  state.handleDigest === handleDigest && invitation.handleDigest === handleDigest &&
  lookup.studioId === invitation.studioId && lookup.studioId === state.studioId &&
  lookup.clientId === invitation.clientId && lookup.clientId === state.clientId &&
  lookup.accessStatus === 'invited' && state.accessStatus === 'invited' &&
  lookup.credentialVersion === state.credentialVersion &&
  invitation.generation === state.invitationGeneration && !invitation.consumed &&
  invitation.consumedAtISO === undefined && new Date(invitation.expiresAtISO).getTime() > now.getTime() &&
  state.pinVerifier === undefined && state.failedPinAttempts === 0 &&
  state.nextAllowedAtISO === undefined;

const invitationInvalid = (origin: string | undefined, allowedOrigins: readonly string[]) =>
  jsonResponse(400, {
    error: 'CLUB_ACCESS_INVITATION_INVALID',
    message: 'Este enlace ya no es válido. Solicita uno nuevo en Bella Mujer Studio.'
  }, origin, allowedOrigins);

const authenticationFailed = (origin: string | undefined, allowedOrigins: readonly string[]) =>
  jsonResponse(401, {
    error: 'CLUB_ACCESS_AUTHENTICATION_FAILED',
    message: 'No pudimos validar el acceso. Revisa tu NIP e intenta nuevamente.'
  }, origin, allowedOrigins);

const concurrentUpdate = (origin: string | undefined, allowedOrigins: readonly string[]) =>
  jsonResponse(409, {
    error: 'CLUB_ACCESS_CONCURRENT_UPDATE',
    message: 'El acceso cambió mientras procesábamos la solicitud. Intenta nuevamente.'
  }, origin, allowedOrigins);

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

const logFailure = (
  event: APIGatewayProxyEventV2,
  operation: Operation,
  error: unknown
): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? error.$metadata as { requestId?: unknown; httpStatusCode?: unknown }
    : undefined;
  console.error('Club member authentication operation failed', {
    operation,
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode } : {})
  });
};

export const createMemberClubAuthHandler = ({
  persistence,
  pepperProvider,
  pepperVersion,
  clock = currentDate,
  sessionTokenGenerator = generateSessionToken,
  crypto = { derive: derivePinVerifier, verify: verifyPin },
  allowedOrigins = originsFromEnvironment()
}: MemberClubAuthDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers.origin;
    const operation = event.routeKey === 'POST /club/access/enroll' ? 'enroll'
      : event.routeKey === 'POST /club/access/login' ? 'login'
        : undefined;
    if (!operation) return validationErrorResponse(origin, allowedOrigins);
    if (bodySize(event) > MEMBER_AUTH_MAX_REQUEST_BODY_BYTES) {
      return payloadTooLargeResponse(origin, allowedOrigins);
    }

    const body = operation === 'enroll'
      ? parseExactBody<EnrollmentBody>(event, ['accessHandle', 'invitationToken', 'pin'])
      : parseExactBody<LoginBody>(event, ['accessHandle', 'pin']);
    if (!body) return validationErrorResponse(origin, allowedOrigins);
    let accessHandle: string;
    try {
      accessHandle = validateCanonicalOpaqueToken(body.accessHandle);
      if (operation === 'enroll') {
        validateCanonicalOpaqueToken((body as EnrollmentBody).invitationToken);
      }
    } catch {
      return operation === 'enroll'
        ? invitationInvalid(origin, allowedOrigins)
        : authenticationFailed(origin, allowedOrigins);
    }
    if (operation === 'enroll' && !isValidSixDigitPin(body.pin)) {
      return jsonResponse(400, {
        error: 'CLUB_PIN_INVALID',
        message: 'Elige un NIP de seis dígitos que no sea común ni repetido.'
      }, origin, allowedOrigins);
    }
    if (operation === 'login' && !/^[0-9]{6}$/.test(body.pin)) {
      return validationErrorResponse(origin, allowedOrigins);
    }

    const handleDigest = digestSecret(accessHandle);
    try {
      const lookup = await persistence.getHandleLookup(handleDigest);
      if (operation === 'enroll') {
        const enrollment = body as EnrollmentBody;
        const invitationDigest = digestSecret(enrollment.invitationToken);
        const invitation = await persistence.getInvitation(invitationDigest);
        const state = lookup
          ? await persistence.getMemberAccess(lookup.clientId)
          : undefined;
        const checkedAt = validDate(clock);
        if (!lookup || !invitation || !state || !validInvitationAggregate(
          lookup, invitation, state, handleDigest, invitationDigest, checkedAt
        )) return invitationInvalid(origin, allowedOrigins);

        const pepper = await pepperProvider.getPepper();
        const pinVerifier = await crypto.derive(enrollment.pin, pepper, {
          pepperVersion,
          now: checkedAt
        });
        const committedAt = validDate(clock);
        const commitAtISO = committedAt.toISOString();
        const rawSessionToken = validateCanonicalOpaqueToken(sessionTokenGenerator());
        const nextState: MemberAccessState = {
          ...state,
          accessStatus: 'active',
          failedPinAttempts: 0,
          pinVerifier,
          updatedAtISO: commitAtISO
        };
        const nextLookup: HandleLookup = {
          ...lookup,
          accessStatus: 'active',
          updatedAtISO: commitAtISO
        };
        const consumedInvitation: AccessInvitation = {
          ...invitation,
          consumed: true,
          consumedAtISO: commitAtISO
        };
        const session = createSessionRecord(
          state,
          digestSecret(rawSessionToken),
          committedAt
        );
        try {
          await persistence.completeEnrollment(
            state, lookup, invitation, nextState, nextLookup,
            consumedInvitation, session, commitAtISO
          );
        } catch (error) {
          if (transactionConflict(error)) return invitationInvalid(origin, allowedOrigins);
          throw error;
        }
        return jsonResponse(201, {
          session: { token: rawSessionToken, expiresAtISO: session.expiresAtISO }
        }, origin, allowedOrigins);
      }

      const state = lookup ? await persistence.getMemberAccess(lookup.clientId) : undefined;
      if (!lookup || !state || !validActiveAggregate(lookup, state, handleDigest)) {
        return authenticationFailed(origin, allowedOrigins);
      }
      const persistedVerifier = state.pinVerifier;
      if (!persistedVerifier) return authenticationFailed(origin, allowedOrigins);
      const checkedAt = validDate(clock);
      if (state.nextAllowedAtISO) {
        const nextAllowed = new Date(state.nextAllowedAtISO).getTime();
        if (nextAllowed > checkedAt.getTime()) return jsonResponse(429, {
          error: 'CLUB_ACCESS_THROTTLED',
          message: 'Espera un momento antes de intentar nuevamente.',
          retryAfterSeconds: Math.max(1, Math.ceil((nextAllowed - checkedAt.getTime()) / 1000))
        }, origin, allowedOrigins);
      }

      const pepper = await pepperProvider.getPepper();
      const verified = await crypto.verify(body.pin, pepper, persistedVerifier, { pepperVersion });
      if (!verified) {
        let expected = state;
        for (let attempt = 0; attempt < FAILED_PIN_CAS_ATTEMPTS; attempt += 1) {
          const attemptedAt = validDate(clock);
          const transition = failedPinTransition(expected.failedPinAttempts, attemptedAt);
          const next: MemberAccessState = {
            ...expected,
            failedPinAttempts: transition.failedPinAttempts,
            ...(transition.nextAllowedAtISO
              ? { nextAllowedAtISO: transition.nextAllowedAtISO }
              : { nextAllowedAtISO: undefined }),
            updatedAtISO: attemptedAt.toISOString()
          };
          try {
            await persistence.recordFailedPinAttempt(expected, next);
            return authenticationFailed(origin, allowedOrigins);
          } catch (error) {
            if (!transactionConflict(error)) throw error;
            const current = await persistence.getMemberAccess(expected.clientId);
            if (!current || !sameCredential(state, current)) {
              return authenticationFailed(origin, allowedOrigins);
            }
            expected = current;
          }
        }
        return concurrentUpdate(origin, allowedOrigins);
      }

      const authenticatedAt = validDate(clock);
      const rawSessionToken = validateCanonicalOpaqueToken(sessionTokenGenerator());
      const next: MemberAccessState = {
        ...state,
        failedPinAttempts: 0,
        nextAllowedAtISO: undefined,
        updatedAtISO: authenticatedAt.toISOString()
      };
      const session = createSessionRecord(state, digestSecret(rawSessionToken), authenticatedAt);
      try {
        await persistence.completeSuccessfulLogin(state, next, session);
      } catch (error) {
        if (transactionConflict(error)) return concurrentUpdate(origin, allowedOrigins);
        throw error;
      }
      return jsonResponse(200, {
        session: { token: rawSessionToken, expiresAtISO: session.expiresAtISO }
      }, origin, allowedOrigins);
    } catch (error) {
      logFailure(event, operation, error);
      return serverErrorResponse(origin, allowedOrigins);
    }
  };

const accessTableName = process.env.CLUB_ACCESS_TABLE_NAME;
const pepperSecretArn = process.env.CLUB_PIN_PEPPER_SECRET_ARN;
const pepperVersion = process.env.CLUB_PIN_PEPPER_VERSION;
if (!accessTableName) console.warn('CLUB_ACCESS_TABLE_NAME is not configured.');
if (!pepperSecretArn) console.warn('CLUB_PIN_PEPPER_SECRET_ARN is not configured.');
if (!pepperVersion) console.warn('CLUB_PIN_PEPPER_VERSION is not configured.');

const unavailable = async (): Promise<never> => {
  throw new Error('Club member authentication is not configured');
};
const client = new DynamoDBClient({});
const persistence = accessTableName
  ? new DynamoClubAccessPersistence(client, accessTableName)
  : {
      getHandleLookup: unavailable,
      getInvitation: unavailable,
      getMemberAccess: unavailable,
      completeEnrollment: unavailable,
      recordFailedPinAttempt: unavailable,
      completeSuccessfulLogin: unavailable
    };
const pepperProvider = pepperSecretArn
  ? createRuntimePinPepperProvider(pepperSecretArn)
  : { getPepper: unavailable };

export const handler = createMemberClubAuthHandler({
  persistence,
  pepperProvider,
  pepperVersion: pepperVersion ?? ''
});
