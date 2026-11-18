import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { ClubClient, LoyaltyLedgerEntry } from '../src/club/club-model';
import { ClubLedgerContinuationKey } from '../src/club/club-persistence';
import {
  createMemberClubHistoryHandler,
  DEFAULT_MEMBER_CLUB_HISTORY_LIMIT,
  MemberClubHistoryPersistence
} from '../src/handlers/member-club-history';

const client: ClubClient = {
  studioId: 'bella-mujer', clientId: 'client-01', name: 'Ana Privada', phone: '+525500000000',
  status: 'active', createdAtISO: '2026-11-18T17:00:00.000Z', updatedAtISO: '2026-11-18T17:00:00.000Z'
};
const entry: LoyaltyLedgerEntry = {
  studioId: 'bella-mujer', clientId: 'client-01', entryId: 'internal-entry-id',
  type: 'STAMP_EARNED', occurredAtISO: '2026-11-18T18:00:00.000Z',
  createdAtISO: '2026-11-18T18:02:00.000Z', stampDelta: 1, eligibleSpendDeltaMXN: 300,
  stampCountAfter: 3, eligibleSpendCarryAfterMXN: 20, createdByAdminSub: 'admin-private',
  visitId: 'internal-visit-id', reason: 'private admin reason'
};
const key: ClubLedgerContinuationKey = {
  pk: { S: 'STUDIO#bella-mujer#CLIENT#client-01' },
  sk: { S: 'LEDGER#2026-11-18T18:00:00.000Z#internal-entry-id' }
};

const event = (
  lambda: unknown = { studioId: 'bella-mujer', clientId: 'client-01' },
  queryStringParameters?: Record<string, string>
): APIGatewayProxyEventV2 => ({
  version: '2.0', routeKey: 'GET /club/me/history', rawPath: '/club/me/history', rawQueryString: '',
  headers: {}, queryStringParameters,
  requestContext: { requestId: 'member-history-request', authorizer: { lambda } } as unknown as APIGatewayProxyEventV2['requestContext'],
  isBase64Encoded: false
});

const setup = () => {
  const getClient = vi.fn<MemberClubHistoryPersistence['getClient']>().mockResolvedValue(client);
  const listLedgerEntries = vi.fn<MemberClubHistoryPersistence['listLedgerEntries']>()
    .mockResolvedValue({ items: [entry] });
  return {
    getClient,
    listLedgerEntries,
    handler: createMemberClubHistoryHandler({ persistence: { getClient, listLedgerEntries } })
  };
};

describe('member Club history', () => {
  it('uses only trusted authorizer identity and returns the exact member-safe projection', async () => {
    const { handler, getClient, listLedgerEntries } = setup();
    const response = await handler({
      ...event(), rawQueryString: 'clientId=other&studioId=other',
      queryStringParameters: { clientId: 'other', studioId: 'other' },
      pathParameters: { id: 'other' }, body: JSON.stringify({ clientId: 'other', studioId: 'other' })
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toEqual({ items: [{
      occurredAtISO: entry.occurredAtISO, type: 'STAMP_EARNED', stampDelta: 1, stampCountAfter: 3
    }] });
    expect(getClient).toHaveBeenCalledWith('bella-mujer', 'client-01');
    expect(listLedgerEntries).toHaveBeenCalledWith(
      'bella-mujer', 'client-01', DEFAULT_MEMBER_CLUB_HISTORY_LIMIT, undefined
    );
    for (const forbidden of [
      'studioId', 'clientId', 'entryId', 'createdAtISO', 'createdByAdminSub',
      'eligibleSpendCarryAfterMXN', 'eligibleSpendDeltaMXN', 'visitId', 'reason', 'phone'
    ]) expect(response.body).not.toContain(forbidden);
  });

  it('returns a valid empty history', async () => {
    const { handler, listLedgerEntries } = setup();
    listLedgerEntries.mockResolvedValue({ items: [] });
    expect(JSON.parse((await handler(event())).body ?? '{}')).toEqual({ items: [] });
  });

  it('accepts an explicit bounded limit', async () => {
    const { handler, listLedgerEntries } = setup();
    expect((await handler(event(undefined, { limit: '7' }))).statusCode).toBe(200);
    expect(listLedgerEntries).toHaveBeenCalledWith('bella-mujer', 'client-01', 7, undefined);
  });

  it.each(['0', '51', '-1', '1.5', '', 'abc'])('rejects malformed limit %j', async (limit) => {
    const { handler, getClient, listLedgerEntries } = setup();
    expect((await handler(event(undefined, { limit }))).statusCode).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
    expect(listLedgerEntries).not.toHaveBeenCalled();
  });

  it('round-trips a client-bound opaque continuation token without PII', async () => {
    const { handler, listLedgerEntries } = setup();
    listLedgerEntries.mockResolvedValueOnce({ items: [entry], lastEvaluatedKey: key });
    const first = JSON.parse((await handler(event())).body ?? '{}');
    expect(first.nextToken).toEqual(expect.any(String));
    expect(first.nextToken).not.toContain('Ana');
    expect(first.nextToken).not.toContain('5255');
    expect((await handler(event(undefined, { nextToken: first.nextToken }))).statusCode).toBe(200);
    expect(listLedgerEntries).toHaveBeenLastCalledWith(
      'bella-mujer', 'client-01', DEFAULT_MEMBER_CLUB_HISTORY_LIMIT, key
    );
  });

  it.each([
    'bad+',
    Buffer.from('{bad').toString('base64url'),
    Buffer.from(JSON.stringify({ ...key, pk: { S: 'STUDIO#bella-mujer#CLIENT#other' } })).toString('base64url'),
    Buffer.from(JSON.stringify({ ...key, sk: { S: 'BALANCE' } })).toString('base64url')
  ])('rejects malformed or cross-client continuation tokens', async (nextToken) => {
    const { handler, getClient, listLedgerEntries } = setup();
    expect((await handler(event(undefined, { nextToken }))).statusCode).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
    expect(listLedgerEntries).not.toHaveBeenCalled();
  });

  it('fails safely when the authenticated member aggregate is missing', async () => {
    const { handler, getClient, listLedgerEntries } = setup();
    getClient.mockResolvedValue(undefined);
    const response = await handler(event());
    expect(response.statusCode).toBe(500);
    expect(listLedgerEntries).not.toHaveBeenCalled();
    expect(response.body).not.toContain('client-01');
  });

  it('fails safely and logs only request metadata for persistence errors', async () => {
    const persistenceError = Object.assign(new Error('Ana Privada +525500000000'), {
      $metadata: { requestId: 'aws-request-id', httpStatusCode: 500 }
    });
    const { listLedgerEntries } = setup();
    listLedgerEntries.mockRejectedValue(persistenceError);
    const isolated = createMemberClubHistoryHandler({
      persistence: { getClient: vi.fn().mockResolvedValue(client), listLedgerEntries }
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await isolated(event());
    const logged = JSON.stringify(log.mock.calls);
    expect(response.statusCode).toBe(500);
    expect(logged).toContain('member-history-request');
    expect(logged).toContain('aws-request-id');
    expect(logged).not.toContain('Ana Privada');
    expect(response.body).not.toContain('Ana Privada');
    log.mockRestore();
  });

  it('fails safely when trusted member context is missing', async () => {
    const { handler } = setup();
    expect((await handler(event(null))).statusCode).toBe(500);
  });
});
