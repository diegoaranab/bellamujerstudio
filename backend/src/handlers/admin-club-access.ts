import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
  digestSecret,
  generateAccessHandle,
  generateInvitationToken
} from '../club-access/club-access-crypto';
import {
  AccessInvitation,
  HandleLookup,
  MemberAccessState
} from '../club-access/club-access-model';
import { DynamoClubAccessPersistence } from '../club-access/club-access-persistence';
import { ClubClient } from '../club/club-model';
import { DynamoClubPersistence } from '../club/club-persistence';
import { originsFromEnvironment } from '../shared/frontend-configuration';
import { jsonResponse, validationErrorResponse } from '../shared/response';
import { Clock, currentDate } from '../shared/time';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITATION_VALIDITY_DAYS = 7;

export interface ClubClientAccessReadPersistence {
  getClient(studioId: string, clientId: string): Promise<ClubClient | undefined>;
}

export interface ClubAccessLifecyclePersistence {
  getMemberAccess(clientId: string): Promise<MemberAccessState | undefined>;
  createInitialInvitation(
    state: MemberAccessState,
    lookup: HandleLookup,
    invitation: AccessInvitation
  ): Promise<void>;
  rotatePreEnrollmentInvitation(
    expected: MemberAccessState,
    next: MemberAccessState,
    lookup: HandleLookup,
    invitation: AccessInvitation
  ): Promise<void>;
  fullResetAccess(
    expected: MemberAccessState,
    next: MemberAccessState,
    lookup: HandleLookup,
    invitation: AccessInvitation
  ): Promise<void>;
}

export interface AdminClubAccessHandlerDependencies {
  clubPersistence: ClubClientAccessReadPersistence;
  accessPersistence: ClubAccessLifecyclePersistence;
  studioId: string;
  clock?: Clock;
  accessHandleGenerator?: () => string;
  invitationTokenGenerator?: () => string;
  allowedOrigins?: readonly string[];
}

type LifecycleOperation = 'get-access' | 'create-invitation' | 'reset-access';

const operationFromRoute = (routeKey: string): LifecycleOperation | undefined => {
  switch (routeKey) {
    case 'GET /admin/club/clients/{id}/access': return 'get-access';
    case 'POST /admin/club/clients/{id}/access/invitation': return 'create-invitation';
    case 'POST /admin/club/clients/{id}/access/reset': return 'reset-access';
    default: return undefined;
  }
};

const safeAccess = (state: MemberAccessState) => ({
  status: state.accessStatus,
  credentialVersion: state.credentialVersion,
  invitationGeneration: state.invitationGeneration,
  hasPin: state.pinVerifier !== undefined,
  updatedAtISO: state.updatedAtISO
});

export const buildClubActivationFragment = (
  rawAccessHandle: string,
  rawInvitationToken: string
): string =>
  `#/club/activar?access=${encodeURIComponent(rawAccessHandle)}` +
  `&invite=${encodeURIComponent(rawInvitationToken)}`;

const incrementCounter = (value: number, name: string): number => {
  const next = value + 1;
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(next)) {
    throw new Error(`Club access ${name} exhausted`);
  }
  return next;
};

const invitationTimes = (clock: Clock) => {
  const createdAt = clock();
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) {
    throw new Error('Invalid Club access clock');
  }
  const expiresAt = new Date(createdAt.getTime());
  expiresAt.setUTCDate(expiresAt.getUTCDate() + INVITATION_VALIDITY_DAYS);
  return {
    createdAtISO: createdAt.toISOString(),
    expiresAtISO: expiresAt.toISOString(),
    expiresAtEpoch: Math.floor(expiresAt.getTime() / 1000)
  };
};

const createInvitationRecords = (
  studioId: string,
  clientId: string,
  credentialVersion: number,
  invitationGeneration: number,
  memberCreatedAtISO: string | undefined,
  clock: Clock,
  accessHandleGenerator: () => string,
  invitationTokenGenerator: () => string
) => {
  const rawAccessHandle = accessHandleGenerator();
  const rawInvitationToken = invitationTokenGenerator();
  const handleDigest = digestSecret(rawAccessHandle);
  const invitationDigest = digestSecret(rawInvitationToken);
  if (handleDigest === invitationDigest) {
    throw new Error('Club access secrets must be independently generated');
  }
  const { createdAtISO, expiresAtISO, expiresAtEpoch } = invitationTimes(clock);
  const state: MemberAccessState = {
    studioId,
    clientId,
    handleDigest,
    accessStatus: 'invited',
    credentialVersion,
    invitationGeneration,
    failedPinAttempts: 0,
    createdAtISO: memberCreatedAtISO ?? createdAtISO,
    updatedAtISO: createdAtISO
  };
  const lookup: HandleLookup = {
    handleDigest,
    studioId,
    clientId,
    accessStatus: 'invited',
    credentialVersion,
    createdAtISO,
    updatedAtISO: createdAtISO
  };
  const invitation: AccessInvitation = {
    invitationDigest,
    studioId,
    clientId,
    handleDigest,
    generation: invitationGeneration,
    createdAtISO,
    expiresAtISO,
    expiresAtEpoch,
    consumed: false
  };
  return { state, lookup, invitation, rawAccessHandle, rawInvitationToken };
};

interface TransactionCanceledErrorLike {
  readonly name: 'TransactionCanceledException';
  readonly CancellationReasons?: unknown;
}

const transactionCanceled = (error: unknown): error is TransactionCanceledErrorLike =>
  !!error && typeof error === 'object' &&
  'name' in error && error.name === 'TransactionCanceledException';

const knownLifecycleConflict = (error: unknown, expectedItemCount: number): boolean => {
  if (!transactionCanceled(error) || !Array.isArray(error.CancellationReasons) ||
    error.CancellationReasons.length !== expectedItemCount) return false;
  const codes = error.CancellationReasons.map((reason) =>
    reason && typeof reason === 'object' && 'Code' in reason && typeof reason.Code === 'string'
      ? reason.Code
      : undefined
  );
  if (codes.some((code) => code === undefined)) return false;
  const conditionalFailure = codes.some((code) => code === 'ConditionalCheckFailed') &&
    codes.every((code) => code === 'None' || code === 'ConditionalCheckFailed');
  const transactionConflict = codes.some((code) => code === 'TransactionConflict') &&
    codes.every((code) => code === 'None' || code === 'TransactionConflict');
  return conditionalFailure || transactionConflict;
};

const logFailure = (
  event: APIGatewayProxyEventV2,
  operation: LifecycleOperation,
  error?: unknown
): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? error.$metadata as { requestId?: unknown; httpStatusCode?: unknown }
    : undefined;
  console.error('Administrative Club access operation failed', {
    operation,
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode } : {})
  });
};

const conflictResponse = (
  error: string,
  message: string,
  origin: string | undefined,
  allowedOrigins: readonly string[]
) => jsonResponse(409, { error, message }, origin, allowedOrigins);

const invitationResponse = (
  statusCode: number,
  state: MemberAccessState,
  rawAccessHandle: string,
  rawInvitationToken: string,
  expiresAtISO: string,
  origin: string | undefined,
  allowedOrigins: readonly string[]
) => jsonResponse(statusCode, {
  access: safeAccess(state),
  invitation: {
    activationFragment: buildClubActivationFragment(rawAccessHandle, rawInvitationToken),
    expiresAtISO
  }
}, origin, allowedOrigins);

export const createAdminClubAccessHandler = ({
  clubPersistence,
  accessPersistence,
  studioId,
  clock = currentDate,
  accessHandleGenerator = generateAccessHandle,
  invitationTokenGenerator = generateInvitationToken,
  allowedOrigins = originsFromEnvironment()
}: AdminClubAccessHandlerDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers.origin;
    const operation = operationFromRoute(event.routeKey);
    const rawClientId = event.pathParameters?.id;
    if (!operation || !rawClientId || !UUID.test(rawClientId)) {
      return validationErrorResponse(origin, allowedOrigins);
    }
    if (operation !== 'get-access' && event.body !== undefined && event.body.length > 0) {
      return validationErrorResponse(origin, allowedOrigins);
    }
    const clientId = rawClientId.toLowerCase();

    try {
      const client = await clubPersistence.getClient(studioId, clientId);
      if (!client) return jsonResponse(404, {
        error: 'CLUB_CLIENT_NOT_FOUND',
        message: 'No encontramos la clienta de Bella Mujer Club solicitada.'
      }, origin, allowedOrigins);

      const existing = await accessPersistence.getMemberAccess(clientId);
      if (existing && (existing.studioId !== studioId || existing.clientId !== clientId)) {
        throw new Error('Invalid Club access identity');
      }
      if (operation === 'get-access') {
        return jsonResponse(200, { access: existing ? safeAccess(existing) : null },
          origin, allowedOrigins);
      }

      if (operation === 'create-invitation') {
        if (existing && existing.accessStatus !== 'invited') {
          return conflictResponse(
            'CLUB_ACCESS_RESET_REQUIRED',
            'El acceso ya fue establecido. Usa el restablecimiento completo para continuar.',
            origin,
            allowedOrigins
          );
        }
        if (existing && (
          existing.pinVerifier !== undefined || existing.failedPinAttempts !== 0 ||
          existing.nextAllowedAtISO !== undefined
        )) throw new Error('Invalid pre-enrollment Club access state');

        const generation = existing
          ? incrementCounter(existing.invitationGeneration, 'invitation generation')
          : 1;
        const records = createInvitationRecords(
          studioId,
          clientId,
          existing?.credentialVersion ?? 0,
          generation,
          existing?.createdAtISO,
          clock,
          accessHandleGenerator,
          invitationTokenGenerator
        );
        if (existing && records.state.handleDigest === existing.handleDigest) {
          throw new Error('Club access handle rotation failed');
        }
        try {
          if (existing) {
            await accessPersistence.rotatePreEnrollmentInvitation(
              existing, records.state, records.lookup, records.invitation
            );
          } else {
            await accessPersistence.createInitialInvitation(
              records.state, records.lookup, records.invitation
            );
          }
        } catch (error) {
          if (knownLifecycleConflict(error, existing ? 4 : 3)) {
            return conflictResponse(
              'CLUB_ACCESS_CONCURRENT_UPDATE',
              'El acceso cambió mientras se procesaba la solicitud. Recarga e intenta de nuevo.',
              origin,
              allowedOrigins
            );
          }
          throw error;
        }
        return invitationResponse(
          201, records.state, records.rawAccessHandle, records.rawInvitationToken,
          records.invitation.expiresAtISO, origin, allowedOrigins
        );
      }

      if (!existing) return conflictResponse(
        'CLUB_ACCESS_INVITATION_REQUIRED',
        'Primero genera la invitación inicial para esta clienta.',
        origin,
        allowedOrigins
      );
      if (existing.accessStatus === 'invited') return conflictResponse(
        'CLUB_ACCESS_REGENERATION_REQUIRED',
        'El acceso aún no está establecido. Regenera la invitación para continuar.',
        origin,
        allowedOrigins
      );
      const credentialVersion = incrementCounter(
        existing.credentialVersion,
        'credential version'
      );
      const invitationGeneration = incrementCounter(
        existing.invitationGeneration,
        'invitation generation'
      );
      const records = createInvitationRecords(
        studioId,
        clientId,
        credentialVersion,
        invitationGeneration,
        existing.createdAtISO,
        clock,
        accessHandleGenerator,
        invitationTokenGenerator
      );
      if (records.state.handleDigest === existing.handleDigest) {
        throw new Error('Club access handle rotation failed');
      }
      try {
        await accessPersistence.fullResetAccess(
          existing, records.state, records.lookup, records.invitation
        );
      } catch (error) {
        if (knownLifecycleConflict(error, 4)) return conflictResponse(
          'CLUB_ACCESS_CONCURRENT_UPDATE',
          'El acceso cambió mientras se procesaba la solicitud. Recarga e intenta de nuevo.',
          origin,
          allowedOrigins
        );
        throw error;
      }
      return invitationResponse(
        200, records.state, records.rawAccessHandle, records.rawInvitationToken,
        records.invitation.expiresAtISO, origin, allowedOrigins
      );
    } catch (error) {
      logFailure(event, operation, error);
      return jsonResponse(500, {
        error: 'SERVER_ERROR',
        message: 'No pudimos administrar el acceso de la clienta. Intenta de nuevo en unos minutos.'
      }, origin, allowedOrigins);
    }
  };

const clubTableName = process.env.CLUB_TABLE_NAME;
const accessTableName = process.env.CLUB_ACCESS_TABLE_NAME;
const studioId = process.env.CLUB_STUDIO_ID;
if (!clubTableName) console.warn('CLUB_TABLE_NAME is not configured.');
if (!accessTableName) console.warn('CLUB_ACCESS_TABLE_NAME is not configured.');
if (!studioId) console.warn('CLUB_STUDIO_ID is not configured.');

const unavailable = async (): Promise<never> => {
  throw new Error('Club access persistence is not configured');
};
const dynamoClient = new DynamoDBClient({});
const runtimeClubPersistence: ClubClientAccessReadPersistence = clubTableName
  ? new DynamoClubPersistence(dynamoClient, clubTableName)
  : { getClient: unavailable };
const runtimeAccessPersistence: ClubAccessLifecyclePersistence = accessTableName
  ? new DynamoClubAccessPersistence(dynamoClient, accessTableName)
  : {
      getMemberAccess: unavailable,
      createInitialInvitation: unavailable,
      rotatePreEnrollmentInvitation: unavailable,
      fullResetAccess: unavailable
    };

export const handler = createAdminClubAccessHandler({
  clubPersistence: runtimeClubPersistence,
  accessPersistence: runtimeAccessPersistence,
  studioId: studioId ?? ''
});
