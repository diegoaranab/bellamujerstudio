import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { ClubClient, LoyaltyLedgerEntry } from '../src/club/club-model';
import {
  ClubLedgerReadPersistence,
  createAdminClubLedgerHandler,
  DEFAULT_CLUB_LEDGER_LIMIT
} from '../src/handlers/admin-club-ledger';

const id = '11111111-1111-4111-8111-111111111111';
const now = '2026-11-09T18:00:00.000Z';
const client: ClubClient = {
  studioId: 'bella-mujer', clientId: id, name: 'Ana', phone: '55', status: 'active',
  createdAtISO: now, updatedAtISO: now
};
const item: LoyaltyLedgerEntry = {
  studioId: 'bella-mujer', clientId: id, entryId: 'entry', type: 'ELIGIBLE_SPEND_ADDED',
  occurredAtISO: now, createdAtISO: now, stampDelta: 0, eligibleSpendDeltaMXN: 100,
  stampCountAfter: 0, eligibleSpendCarryAfterMXN: 100, createdByAdminSub: 'admin'
};
const key = {
  pk: { S: `STUDIO#bella-mujer#CLIENT#${id}` },
  sk: { S: `LEDGER#${now}#entry` }
};

const eventFor = (queryStringParameters?: Record<string, string>, pathId = id): APIGatewayProxyEventV2 => ({
  headers: {}, pathParameters: { id: pathId }, queryStringParameters,
  requestContext: { requestId: 'api-request-id' }
}) as unknown as APIGatewayProxyEventV2;

const setup = () => {
  const getClient = vi.fn<ClubLedgerReadPersistence['getClient']>().mockResolvedValue(client);
  const listLedgerEntries = vi.fn<ClubLedgerReadPersistence['listLedgerEntries']>()
    .mockResolvedValue({ items: [item] });
  const handler = createAdminClubLedgerHandler({
    persistence: { getClient, listLedgerEntries }, studioId: 'bella-mujer'
  });
  return { handler, getClient, listLedgerEntries };
};

describe('administrative Club ledger handler', () => {
  it('checks the client and lists newest history with the default limit', async () => {
    const { handler, getClient, listLedgerEntries } = setup();
    const response = await handler(eventFor(undefined, id.toUpperCase()));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toEqual({ items: [item] });
    expect(getClient).toHaveBeenCalledWith('bella-mujer', id);
    expect(listLedgerEntries).toHaveBeenCalledWith(
      'bella-mujer', id, DEFAULT_CLUB_LEDGER_LIMIT, undefined
    );
  });

  it('round-trips an opaque client-bound continuation token', async () => {
    const { handler, listLedgerEntries } = setup();
    listLedgerEntries.mockResolvedValueOnce({ items: [item], lastEvaluatedKey: key });
    const first = JSON.parse((await handler(eventFor())).body ?? '{}');
    expect(first.nextToken).toEqual(expect.any(String));
    expect(first.nextToken).not.toContain('STUDIO');
    expect((await handler(eventFor({ limit: '10', nextToken: first.nextToken }))).statusCode).toBe(200);
    expect(listLedgerEntries).toHaveBeenLastCalledWith('bella-mujer', id, 10, key);
  });

  it.each(['0', '101', '-1', '1.5', '', 'abc'])('rejects malformed limit %j', async (limit) => {
    const { handler, getClient } = setup();
    expect((await handler(eventFor({ limit }))).statusCode).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });

  it.each([
    'bad+',
    Buffer.from('{bad').toString('base64url'),
    Buffer.from(JSON.stringify({ ...key, pk: { S: 'STUDIO#bella-mujer#CLIENT#other' } })).toString('base64url'),
    Buffer.from(JSON.stringify({ ...key, sk: { S: 'BALANCE' } })).toString('base64url')
  ])('rejects forged token %j', async (nextToken) => {
    const { handler, getClient } = setup();
    expect((await handler(eventFor({ nextToken }))).statusCode).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });

  it('rejects a malformed client ID before persistence', async () => {
    const { handler, getClient } = setup();
    expect((await handler(eventFor(undefined, 'bad'))).statusCode).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });

  it('returns 404 without fabricating empty history for a missing client', async () => {
    const { handler, getClient, listLedgerEntries } = setup();
    getClient.mockResolvedValue(undefined);
    const response = await handler(eventFor());
    expect(response.statusCode).toBe(404);
    expect(listLedgerEntries).not.toHaveBeenCalled();
  });

  it('returns a safe 500 without logging persisted data', async () => {
    const { handler, listLedgerEntries } = setup();
    listLedgerEntries.mockRejectedValue(Object.assign(new Error('Ana 55'), {
      $metadata: { requestId: 'aws-request-id', httpStatusCode: 500 }
    }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await handler(eventFor())).statusCode).toBe(500);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain('aws-request-id');
    expect(logged).not.toContain('Ana 55');
    log.mockRestore();
  });
});
