import { createHash } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { calculateLoyalty, STAMP_THRESHOLD_MXN } from '../club/club-loyalty';
import { ClubClient, ClubVisit, LoyaltyBalance, LoyaltyLedgerEntry } from '../club/club-model';
import { CommitVisitOutcomeInput, DynamoClubPersistence } from '../club/club-persistence';
import { originsFromEnvironment } from '../shared/frontend-configuration';
import { jsonResponse, payloadTooLargeResponse, validationErrorResponse } from '../shared/response';
import { Clock, currentDate, currentISO } from '../shared/time';

export const MAX_CLUB_VISIT_BODY_BYTES = 32 * 1024;
export const MAX_VISIT_COMMIT_ATTEMPTS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
const MAX_ADMIN_SUBJECT_LENGTH = 256;

interface VisitRequest {
  occurredAtISO: string;
  amountMXN: number;
  eligibleAmountMXN: number;
  serviceIds: string[];
}

export interface ClubVisitCreatePersistence {
  getClient(studioId: string, clientId: string): Promise<ClubClient | undefined>;
  getBalance(studioId: string, clientId: string): Promise<LoyaltyBalance | undefined>;
  getVisit(studioId: string, clientId: string, visitId: string): Promise<ClubVisit | undefined>;
  getLedgerEntry(
    studioId: string, clientId: string, occurredAtISO: string, entryId: string
  ): Promise<LoyaltyLedgerEntry | undefined>;
  commitVisitOutcome(input: CommitVisitOutcomeInput): Promise<void>;
}

export interface AdminClubVisitCreateHandlerDependencies {
  persistence: ClubVisitCreatePersistence;
  studioId: string;
  clock?: Clock;
  allowedOrigins?: readonly string[];
}

const bodySize = (body: string | undefined, base64?: boolean): number =>
  body ? Buffer.byteLength(body, base64 ? 'base64' : 'utf8') : 0;

const header = (headers: Record<string, string | undefined>, name: string): string | undefined => {
  const target = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === target)?.[1];
};

const adminSubject = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value || value.trim() !== value ||
    Array.from(value).length > MAX_ADMIN_SUBJECT_LENGTH || CONTROL_CHARACTER.test(value)) {
    return undefined;
  }
  return value;
};

const parseRequest = (body: string | undefined, base64?: boolean): VisitRequest => {
  if (!body) throw new Error('Missing body');
  const parsed: unknown = JSON.parse(base64 ? Buffer.from(body, 'base64').toString('utf8') : body);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body');
  const value = parsed as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !==
    'amountMXN,eligibleAmountMXN,occurredAtISO,serviceIds') throw new Error('Invalid keys');
  if (typeof value.occurredAtISO !== 'string' ||
    !Number.isFinite(new Date(value.occurredAtISO).getTime()) ||
    new Date(value.occurredAtISO).toISOString() !== value.occurredAtISO) throw new Error('Invalid date');
  if (!Number.isSafeInteger(value.amountMXN) || (value.amountMXN as number) < 0 ||
    !Number.isSafeInteger(value.eligibleAmountMXN) || (value.eligibleAmountMXN as number) < 0 ||
    (value.eligibleAmountMXN as number) > (value.amountMXN as number)) throw new Error('Invalid money');
  if (!Array.isArray(value.serviceIds) || value.serviceIds.length > 50) throw new Error('Invalid services');
  const serviceIds = value.serviceIds.map((serviceId) => {
    if (typeof serviceId !== 'string' || !serviceId || serviceId.trim() !== serviceId ||
      Array.from(serviceId).length > 128 || serviceId.includes('#') || CONTROL_CHARACTER.test(serviceId)) {
      throw new Error('Invalid service');
    }
    return serviceId;
  });
  if (new Set(serviceIds).size !== serviceIds.length) throw new Error('Duplicate service');
  return {
    occurredAtISO: value.occurredAtISO,
    amountMXN: value.amountMXN as number,
    eligibleAmountMXN: value.eligibleAmountMXN as number,
    serviceIds
  };
};

const fingerprint = (studioId: string, clientId: string, request: VisitRequest): string =>
  createHash('sha256').update(JSON.stringify({
    studioId,
    clientId,
    occurredAtISO: request.occurredAtISO,
    amountMXN: request.amountMXN,
    eligibleAmountMXN: request.eligibleAmountMXN,
    serviceIds: [...request.serviceIds].sort()
  })).digest('hex');

interface TransactionCanceledErrorLike {
  readonly name: 'TransactionCanceledException';
  readonly CancellationReasons?: unknown;
}

const transactionCanceled = (error: unknown): error is TransactionCanceledErrorLike =>
  !!error && typeof error === 'object' &&
  'name' in error && error.name === 'TransactionCanceledException';

const retryableVisitTransactionCancellation = (
  error: unknown,
  expectedTransactionItemCount: number
): boolean => {
  if (!transactionCanceled(error) || !Array.isArray(error.CancellationReasons) ||
    error.CancellationReasons.length !== expectedTransactionItemCount) return false;
  const codes = error.CancellationReasons.map((reason) =>
    reason && typeof reason === 'object' && 'Code' in reason && typeof reason.Code === 'string'
      ? reason.Code
      : undefined
  );
  if (codes.some((code) => code === undefined)) return false;

  const balanceConditionalFailure = codes[expectedTransactionItemCount - 1] ===
    'ConditionalCheckFailed' && codes.slice(0, -1).every((code) => code === 'None');
  const transactionConflict = codes.some((code) => code === 'TransactionConflict') &&
    codes.every((code) => code === 'None' || code === 'TransactionConflict');
  return balanceConditionalFailure || transactionConflict;
};

const safeVisit = ({ requestFingerprint: _fingerprint, ...visit }: ClubVisit) => visit;

const logFailure = (event: APIGatewayProxyEventV2, operation: string, error?: unknown): void => {
  const metadata = error && typeof error === 'object' && '$metadata' in error
    ? error.$metadata as { requestId?: unknown; httpStatusCode?: unknown }
    : undefined;
  console.error('Administrative Club visit operation failed', {
    operation,
    apiRequestId: event.requestContext?.requestId,
    ...(typeof metadata?.requestId === 'string' ? { awsRequestId: metadata.requestId } : {}),
    ...(typeof metadata?.httpStatusCode === 'number'
      ? { awsHttpStatusCode: metadata.httpStatusCode } : {})
  });
};

const outcomeResponse = (
  statusCode: number,
  visit: ClubVisit,
  stampsAwarded: 0 | 1,
  finalEntry: LoyaltyLedgerEntry,
  balance: LoyaltyBalance,
  replayed: boolean,
  origin: string | undefined,
  allowedOrigins: readonly string[]
) => jsonResponse(statusCode, {
  visit: safeVisit(visit),
  loyalty: {
    stampsAwarded,
    stampCountAfter: finalEntry.stampCountAfter,
    eligibleSpendCarryAfterMXN: finalEntry.eligibleSpendCarryAfterMXN
  },
  balance,
  replayed
}, origin, allowedOrigins);

const reconstructReplay = async (
  persistence: ClubVisitCreatePersistence,
  visit: ClubVisit
): Promise<{ stampsAwarded: 0 | 1; finalEntry: LoyaltyLedgerEntry }> => {
  const spend = await persistence.getLedgerEntry(
    visit.studioId, visit.clientId, visit.occurredAtISO, `${visit.visitId}-01-spend`
  );
  if (!spend || spend.type !== 'ELIGIBLE_SPEND_ADDED' || spend.visitId !== visit.visitId ||
    spend.stampDelta !== 0 || spend.eligibleSpendDeltaMXN !== visit.eligibleAmountMXN) {
    throw new Error('Invalid replay ledger');
  }
  if (spend.eligibleSpendCarryAfterMXN < STAMP_THRESHOLD_MXN) {
    return { stampsAwarded: 0, finalEntry: spend };
  }
  const stamp = await persistence.getLedgerEntry(
    visit.studioId, visit.clientId, visit.occurredAtISO, `${visit.visitId}-02-stamp`
  );
  if (!stamp || stamp.type !== 'STAMP_EARNED' || stamp.visitId !== visit.visitId ||
    stamp.stampDelta !== 1 || stamp.eligibleSpendDeltaMXN !== -STAMP_THRESHOLD_MXN ||
    stamp.stampCountAfter !== spend.stampCountAfter + 1 ||
    stamp.eligibleSpendCarryAfterMXN !== spend.eligibleSpendCarryAfterMXN - STAMP_THRESHOLD_MXN) {
    throw new Error('Invalid replay ledger');
  }
  return { stampsAwarded: 1, finalEntry: stamp };
};

const buildOutcome = (
  visit: ClubVisit,
  balance: LoyaltyBalance
): { ledgerEntries: LoyaltyLedgerEntry[]; nextBalance: LoyaltyBalance; stampsAwarded: 0 | 1 } => {
  const loyalty = calculateLoyalty({
    stampCountBefore: balance.stampCount,
    eligibleSpendCarryBeforeMXN: balance.eligibleSpendCarryMXN,
    eligibleVisitAmountMXN: visit.eligibleAmountMXN
  });
  const spendCarry = balance.eligibleSpendCarryMXN + visit.eligibleAmountMXN;
  if (!Number.isSafeInteger(spendCarry)) throw new Error('Loyalty eligible spend overflow');
  const common = {
    studioId: visit.studioId,
    clientId: visit.clientId,
    occurredAtISO: visit.occurredAtISO,
    createdAtISO: visit.createdAtISO,
    createdByAdminSub: visit.createdByAdminSub,
    visitId: visit.visitId
  };
  const ledgerEntries: LoyaltyLedgerEntry[] = [{
    ...common,
    entryId: `${visit.visitId}-01-spend`,
    type: 'ELIGIBLE_SPEND_ADDED',
    stampDelta: 0,
    eligibleSpendDeltaMXN: visit.eligibleAmountMXN,
    stampCountAfter: balance.stampCount,
    eligibleSpendCarryAfterMXN: spendCarry
  }];
  if (loyalty.stampsAwarded === 1) ledgerEntries.push({
    ...common,
    entryId: `${visit.visitId}-02-stamp`,
    type: 'STAMP_EARNED',
    stampDelta: 1,
    eligibleSpendDeltaMXN: -STAMP_THRESHOLD_MXN,
    stampCountAfter: loyalty.stampCountAfter,
    eligibleSpendCarryAfterMXN: loyalty.eligibleSpendCarryAfterMXN
  });
  return {
    ledgerEntries,
    stampsAwarded: loyalty.stampsAwarded,
    nextBalance: {
      ...balance,
      stampCount: loyalty.stampCountAfter,
      eligibleSpendCarryMXN: loyalty.eligibleSpendCarryAfterMXN,
      version: balance.version + 1,
      updatedAtISO: visit.createdAtISO
    }
  };
};

export const createAdminClubVisitCreateHandler = ({
  persistence,
  studioId,
  clock = currentDate,
  allowedOrigins = originsFromEnvironment()
}: AdminClubVisitCreateHandlerDependencies) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const origin = event.headers.origin;
    if (bodySize(event.body, event.isBase64Encoded) > MAX_CLUB_VISIT_BODY_BYTES) {
      return payloadTooLargeResponse(origin, allowedOrigins);
    }
    const rawClientId = event.pathParameters?.id;
    const rawVisitId = header(event.headers, 'idempotency-key');
    const claims = (event.requestContext as unknown as {
      authorizer?: { jwt?: { claims?: Record<string, unknown> } };
    }).authorizer?.jwt?.claims;
    const rawAdminSub = adminSubject(claims?.sub);
    if (!rawClientId || !UUID.test(rawClientId) || !rawVisitId || !UUID.test(rawVisitId) ||
      !rawAdminSub) return validationErrorResponse(origin, allowedOrigins);

    let request: VisitRequest;
    try {
      request = parseRequest(event.body, event.isBase64Encoded);
    } catch {
      return validationErrorResponse(origin, allowedOrigins);
    }
    const clientId = rawClientId.toLowerCase();
    const visitId = rawVisitId.toLowerCase();
    const requestFingerprint = fingerprint(studioId, clientId, request);
    const visit: ClubVisit = {
      studioId,
      clientId,
      visitId,
      ...request,
      source: 'admin',
      createdByAdminSub: rawAdminSub,
      requestFingerprint,
      createdAtISO: currentISO(clock)
    };

    try {
      const client = await persistence.getClient(studioId, clientId);
      if (!client) return jsonResponse(404, {
        error: 'CLUB_CLIENT_NOT_FOUND',
        message: 'No encontramos la clienta de Bella Mujer Club solicitada.'
      }, origin, allowedOrigins);
      let balance = await persistence.getBalance(studioId, clientId);
      if (!balance) throw new Error('Missing Club balance');

      const existing = await persistence.getVisit(studioId, clientId, visitId);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) return jsonResponse(409, {
          error: 'CLUB_VISIT_IDEMPOTENCY_CONFLICT',
          message: 'La clave de idempotencia ya fue utilizada para otra visita.'
        }, origin, allowedOrigins);
        const replay = await reconstructReplay(persistence, existing);
        return outcomeResponse(200, existing, replay.stampsAwarded, replay.finalEntry,
          balance, true, origin, allowedOrigins);
      }

      for (let attempt = 0; attempt < MAX_VISIT_COMMIT_ATTEMPTS; attempt += 1) {
        const outcome = buildOutcome(visit, balance);
        try {
          await persistence.commitVisitOutcome({
            visit,
            ledgerEntries: outcome.ledgerEntries,
            expectedBalanceVersion: balance.version,
            nextBalance: outcome.nextBalance
          });
          return outcomeResponse(201, visit, outcome.stampsAwarded,
            outcome.ledgerEntries[outcome.ledgerEntries.length - 1], outcome.nextBalance,
            false, origin, allowedOrigins);
        } catch (error) {
          if (!transactionCanceled(error)) throw error;
          const committed = await persistence.getVisit(studioId, clientId, visitId);
          if (committed) {
            if (committed.requestFingerprint !== requestFingerprint) return jsonResponse(409, {
              error: 'CLUB_VISIT_IDEMPOTENCY_CONFLICT',
              message: 'La clave de idempotencia ya fue utilizada para otra visita.'
            }, origin, allowedOrigins);
            const currentBalance = await persistence.getBalance(studioId, clientId);
            if (!currentBalance) throw new Error('Missing Club balance');
            const replay = await reconstructReplay(persistence, committed);
            return outcomeResponse(200, committed, replay.stampsAwarded, replay.finalEntry,
              currentBalance, true, origin, allowedOrigins);
          }
          if (!retryableVisitTransactionCancellation(
            error, outcome.ledgerEntries.length + 2
          )) throw error;
          if (attempt === MAX_VISIT_COMMIT_ATTEMPTS - 1) return jsonResponse(409, {
            error: 'CLUB_VISIT_CONCURRENT_UPDATE',
            message: 'El saldo cambió al registrar la visita. Intenta de nuevo.'
          }, origin, allowedOrigins);
          const refreshed = await persistence.getBalance(studioId, clientId);
          if (!refreshed) throw new Error('Missing Club balance');
          balance = refreshed;
        }
      }
      throw new Error('Unreachable visit retry state');
    } catch (error) {
      logFailure(event, 'create-visit', error);
      return jsonResponse(500, {
        error: 'SERVER_ERROR',
        message: 'No pudimos registrar la visita. Intenta de nuevo en unos minutos.'
      }, origin, allowedOrigins);
    }
  };

const tableName = process.env.CLUB_TABLE_NAME;
const studioId = process.env.CLUB_STUDIO_ID;
if (!tableName) console.warn('CLUB_TABLE_NAME is not configured.');
if (!studioId) console.warn('CLUB_STUDIO_ID is not configured.');
const unavailable = async (): Promise<never> => { throw new Error('Club table is not configured'); };
const runtimePersistence: ClubVisitCreatePersistence = tableName
  ? new DynamoClubPersistence(new DynamoDBClient({}), tableName)
  : {
      getClient: unavailable, getBalance: unavailable, getVisit: unavailable,
      getLedgerEntry: unavailable, commitVisitOutcome: unavailable
    };

export const handler = createAdminClubVisitCreateHandler({
  persistence: runtimePersistence,
  studioId: studioId ?? ''
});
