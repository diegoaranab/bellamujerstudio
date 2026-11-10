import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { ClubClient, ClubVisit, LoyaltyBalance, LoyaltyLedgerEntry } from '../src/club/club-model';
import {
  AdminClubVisitCreateHandlerDependencies,
  ClubVisitCreatePersistence,
  createAdminClubVisitCreateHandler,
  MAX_CLUB_VISIT_BODY_BYTES,
  MAX_VISIT_COMMIT_ATTEMPTS
} from '../src/handlers/admin-club-visit-create';

const clientId = '11111111-1111-4111-8111-111111111111';
const visitId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const normalizedVisitId = visitId.toLowerCase();
const adminSub = '22222222-2222-4222-8222-222222222222';
const occurredAtISO = '2026-11-09T17:00:00.000Z';
const nowISO = '2026-11-09T18:00:00.000Z';
const client: ClubClient = {
  studioId: 'bella-mujer', clientId, name: 'Ana Privada', phone: '+52 55 0000 0000',
  status: 'active', createdAtISO: nowISO, updatedAtISO: nowISO
};
const balance: LoyaltyBalance = {
  studioId: 'bella-mujer', clientId, stampCount: 3, eligibleSpendCarryMXN: 0,
  version: 4, updatedAtISO: nowISO
};
const validBody = {
  occurredAtISO, amountMXN: 250, eligibleAmountMXN: 250, serviceIds: ['service-a']
};

const eventFor = (
  body: unknown = validBody,
  options: { base64?: boolean; id?: string; key?: string; sub?: string; noSub?: boolean } = {}
): APIGatewayProxyEventV2 => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    headers: { origin: 'http://localhost:4200', 'Idempotency-Key': options.key ?? visitId },
    pathParameters: { id: options.id ?? clientId.toUpperCase() },
    body: options.base64 ? Buffer.from(text).toString('base64') : text,
    isBase64Encoded: options.base64 ?? false,
    requestContext: {
      requestId: 'api-request-id',
      authorizer: { jwt: { claims: options.noSub ? {} : { sub: options.sub ?? adminSub } } }
    }
  } as unknown as APIGatewayProxyEventV2;
};

const setup = (overrides: Partial<AdminClubVisitCreateHandlerDependencies> = {}) => {
  const getClient = vi.fn<ClubVisitCreatePersistence['getClient']>().mockResolvedValue(client);
  const getBalance = vi.fn<ClubVisitCreatePersistence['getBalance']>().mockResolvedValue(balance);
  const getVisit = vi.fn<ClubVisitCreatePersistence['getVisit']>().mockResolvedValue(undefined);
  const getLedgerEntry = vi.fn<ClubVisitCreatePersistence['getLedgerEntry']>().mockResolvedValue(undefined);
  const commitVisitOutcome = vi.fn<ClubVisitCreatePersistence['commitVisitOutcome']>().mockResolvedValue();
  const persistence = { getClient, getBalance, getVisit, getLedgerEntry, commitVisitOutcome };
  const handler = createAdminClubVisitCreateHandler({
    persistence, studioId: 'bella-mujer', clock: () => new Date(nowISO), ...overrides
  });
  return { handler, ...persistence };
};

describe('administrative Club visit creation handler', () => {
  it.each([false, true])('creates a valid visit atomically (base64: %s)', async (base64) => {
    const { handler, commitVisitOutcome } = setup();
    const response = await handler(eventFor(validBody, { base64 }));
    const body = JSON.parse(response.body ?? '{}');
    const input = commitVisitOutcome.mock.calls[0][0];
    expect(response.statusCode).toBe(201);
    expect(input.visit).toMatchObject({
      studioId: 'bella-mujer', clientId, visitId: normalizedVisitId,
      createdByAdminSub: adminSub, source: 'admin', ...validBody
    });
    expect(input.visit.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(input.expectedBalanceVersion).toBe(4);
    expect(input.nextBalance).toMatchObject({
      stampCount: 3, eligibleSpendCarryMXN: 250, version: 5, updatedAtISO: nowISO
    });
    expect(input.ledgerEntries).toEqual([expect.objectContaining({
      entryId: `${normalizedVisitId}-01-spend`, type: 'ELIGIBLE_SPEND_ADDED',
      eligibleSpendDeltaMXN: 250, stampDelta: 0,
      stampCountAfter: 3, eligibleSpendCarryAfterMXN: 250
    })]);
    expect(body).toMatchObject({ replayed: false, loyalty: {
      stampsAwarded: 0, stampCountAfter: 3, eligibleSpendCarryAfterMXN: 250
    }});
    expect(JSON.stringify(body)).not.toContain('requestFingerprint');
  });

  it.each([
    [250, 100, 50],
    [0, 800, 500]
  ])('awards exactly one stamp for carry %s plus eligible %s', async (carry, eligible, after) => {
    const { handler, getBalance, commitVisitOutcome } = setup();
    getBalance.mockResolvedValue({ ...balance, eligibleSpendCarryMXN: carry });
    const response = await handler(eventFor({
      ...validBody, amountMXN: eligible, eligibleAmountMXN: eligible
    }));
    const input = commitVisitOutcome.mock.calls[0][0];
    expect(response.statusCode).toBe(201);
    expect(input.ledgerEntries).toHaveLength(2);
    expect(input.ledgerEntries[0]).toMatchObject({
      type: 'ELIGIBLE_SPEND_ADDED', eligibleSpendDeltaMXN: eligible,
      eligibleSpendCarryAfterMXN: carry + eligible, stampDelta: 0
    });
    expect(input.ledgerEntries[1]).toMatchObject({
      type: 'STAMP_EARNED', eligibleSpendDeltaMXN: -300,
      eligibleSpendCarryAfterMXN: after, stampDelta: 1, stampCountAfter: 4
    });
  });

  it('fingerprints normalized logical content with deterministic service ordering', async () => {
    const first = setup();
    const second = setup();
    await first.handler(eventFor({ ...validBody, serviceIds: ['service-b', 'service-a'] }));
    await second.handler(eventFor({ ...validBody, serviceIds: ['service-a', 'service-b'] }));
    expect(first.commitVisitOutcome.mock.calls[0][0].visit.requestFingerprint).toBe(
      second.commitVisitOutcome.mock.calls[0][0].visit.requestFingerprint
    );
  });

  it.each([
    [{ ...validBody, unknown: true }],
    [{ ...validBody, occurredAtISO: '2026-11-09' }],
    [{ ...validBody, amountMXN: -1 }],
    [{ ...validBody, amountMXN: 1.5 }],
    [{ ...validBody, eligibleAmountMXN: 251 }],
    [{ ...validBody, serviceIds: Array.from({ length: 51 }, (_, i) => `s${i}`) }],
    [{ ...validBody, serviceIds: ['same', 'same'] }],
    [{ ...validBody, serviceIds: ['bad#id'] }],
    [{ ...validBody, serviceIds: [' padded'] }]
  ])('rejects invalid body %j before DynamoDB', async (body) => {
    const { handler, getClient } = setup();
    expect((await handler(eventFor(body))).statusCode).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });

  it.each([
    [{ id: 'bad' }],
    [{ key: 'bad' }],
    [{ key: '' }],
    [{ noSub: true }],
    [{ sub: 'bad' }]
  ])('rejects malformed identity input %j before DynamoDB', async (options) => {
    const { handler, getClient } = setup();
    expect((await handler(eventFor(validBody, options))).statusCode).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });

  it('rejects an oversized request before DynamoDB', async () => {
    const { handler, getClient } = setup();
    expect((await handler(eventFor('x'.repeat(MAX_CLUB_VISIT_BODY_BYTES + 1)))).statusCode).toBe(413);
    expect(getClient).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing client and a safe 500 for a missing balance', async () => {
    const missing = setup();
    missing.getClient.mockResolvedValue(undefined);
    expect((await missing.handler(eventFor())).statusCode).toBe(404);
    expect(missing.getBalance).not.toHaveBeenCalled();

    const invalid = setup();
    invalid.getBalance.mockResolvedValue(undefined);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await invalid.handler(eventFor())).statusCode).toBe(500);
    expect(invalid.commitVisitOutcome).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('returns the original outcome for a safe replay without awarding again', async () => {
    const { handler, getVisit, getLedgerEntry, commitVisitOutcome } = setup();
    const storedVisit: ClubVisit = {
      studioId: 'bella-mujer', clientId, visitId: normalizedVisitId, ...validBody,
      source: 'admin', createdByAdminSub: adminSub, requestFingerprint: '', createdAtISO: nowISO
    };
    const first = setup();
    await first.handler(eventFor());
    storedVisit.requestFingerprint = first.commitVisitOutcome.mock.calls[0][0].visit.requestFingerprint;
    getVisit.mockResolvedValue(storedVisit);
    const spend: LoyaltyLedgerEntry = {
      studioId: 'bella-mujer', clientId, entryId: `${normalizedVisitId}-01-spend`,
      type: 'ELIGIBLE_SPEND_ADDED', occurredAtISO, createdAtISO: nowISO, stampDelta: 0,
      eligibleSpendDeltaMXN: 250, stampCountAfter: 3, eligibleSpendCarryAfterMXN: 250,
      createdByAdminSub: adminSub, visitId: normalizedVisitId
    };
    getLedgerEntry.mockResolvedValue(spend);
    const response = await handler(eventFor());
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({ replayed: true, loyalty: {
      stampsAwarded: 0, stampCountAfter: 3, eligibleSpendCarryAfterMXN: 250
    }});
    expect(commitVisitOutcome).not.toHaveBeenCalled();
  });

  it('rejects reuse of a visit ID for different logical content', async () => {
    const { handler, getVisit, commitVisitOutcome } = setup();
    getVisit.mockResolvedValue({
      studioId: 'bella-mujer', clientId, visitId: normalizedVisitId, ...validBody,
      source: 'admin', createdByAdminSub: adminSub, requestFingerprint: 'a'.repeat(64), createdAtISO: nowISO
    });
    const response = await handler(eventFor());
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body ?? '{}').error).toBe('CLUB_VISIT_IDEMPOTENCY_CONFLICT');
    expect(commitVisitOutcome).not.toHaveBeenCalled();
  });

  it('retries a bounded number of optimistic transaction cancellations', async () => {
    const { handler, commitVisitOutcome, getVisit, getBalance } = setup();
    const canceled = Object.assign(new Error('private transaction details'), {
      name: 'TransactionCanceledException'
    });
    commitVisitOutcome.mockRejectedValue(canceled);
    const response = await handler(eventFor());
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body ?? '{}').error).toBe('CLUB_VISIT_CONCURRENT_UPDATE');
    expect(commitVisitOutcome).toHaveBeenCalledTimes(MAX_VISIT_COMMIT_ATTEMPTS);
    expect(getVisit).toHaveBeenCalledTimes(MAX_VISIT_COMMIT_ATTEMPTS + 1);
    expect(getBalance).toHaveBeenCalledTimes(MAX_VISIT_COMMIT_ATTEMPTS);
  });

  it('re-reads and recomputes from the latest balance after an optimistic race', async () => {
    const { handler, commitVisitOutcome, getVisit, getBalance } = setup();
    commitVisitOutcome
      .mockRejectedValueOnce(Object.assign(new Error('race'), { name: 'TransactionCanceledException' }))
      .mockResolvedValueOnce();
    getBalance
      .mockResolvedValueOnce(balance)
      .mockResolvedValueOnce({ ...balance, eligibleSpendCarryMXN: 250, version: 5 });
    const response = await handler(eventFor({
      ...validBody, amountMXN: 100, eligibleAmountMXN: 100
    }));
    expect(response.statusCode).toBe(201);
    expect(commitVisitOutcome).toHaveBeenCalledTimes(2);
    expect(getVisit).toHaveBeenCalledTimes(2);
    expect(commitVisitOutcome.mock.calls[1][0]).toMatchObject({
      expectedBalanceVersion: 5,
      nextBalance: { stampCount: 4, eligibleSpendCarryMXN: 50, version: 6 },
      ledgerEntries: [
        { eligibleSpendCarryAfterMXN: 350 },
        { stampCountAfter: 4, eligibleSpendCarryAfterMXN: 50 }
      ]
    });
  });

  it('does not retry infrastructure failures or leak request data in logs', async () => {
    const { handler, commitVisitOutcome } = setup();
    commitVisitOutcome.mockRejectedValue(Object.assign(new Error('service-a Ana Privada token'), {
      $metadata: { requestId: 'aws-request-id', httpStatusCode: 500 }
    }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await handler(eventFor());
    const logged = JSON.stringify(log.mock.calls);
    expect(response.statusCode).toBe(500);
    expect(commitVisitOutcome).toHaveBeenCalledOnce();
    expect(logged).toContain('aws-request-id');
    expect(logged).not.toContain('service-a');
    expect(logged).not.toContain('Ana Privada');
    expect(logged).not.toContain('token');
    log.mockRestore();
  });
});
