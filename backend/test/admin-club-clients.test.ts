import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { ClubClient, LoyaltyBalance } from '../src/club/club-model';
import {
  ClubClientsReadPersistence,
  createAdminClubClientsHandler,
  DEFAULT_CLUB_CLIENT_LIMIT
} from '../src/handlers/admin-club-clients';

const id = '11111111-1111-4111-8111-111111111111';
const now = '2026-11-09T18:00:00.000Z';
const client: ClubClient = {
  studioId: 'bella-mujer', clientId: id, name: 'Ana Privada', phone: '+52 55 0000 0000',
  status: 'active', createdAtISO: now, updatedAtISO: now
};
const balance: LoyaltyBalance = {
  studioId: 'bella-mujer', clientId: id, stampCount: 0, eligibleSpendCarryMXN: 0,
  version: 0, updatedAtISO: now
};
const key = { pk: { S: 'STUDIO#bella-mujer' }, sk: { S: `CLIENT#${id}` } };

const listEvent = (queryStringParameters?: Record<string, string>): APIGatewayProxyEventV2 => ({
  routeKey: 'GET /admin/club/clients', headers: {}, queryStringParameters,
  requestContext: { requestId: 'api-request-id' }
}) as unknown as APIGatewayProxyEventV2;

const detailEvent = (pathId?: string): APIGatewayProxyEventV2 => ({
  routeKey: 'GET /admin/club/clients/{id}', headers: {},
  ...(pathId === undefined ? {} : { pathParameters: { id: pathId } }),
  requestContext: { requestId: 'api-request-id' }
}) as unknown as APIGatewayProxyEventV2;

const setup = () => {
  const listClients = vi.fn<ClubClientsReadPersistence['listClients']>()
    .mockResolvedValue({ items: [client] });
  const getClient = vi.fn<ClubClientsReadPersistence['getClient']>().mockResolvedValue(client);
  const getBalance = vi.fn<ClubClientsReadPersistence['getBalance']>().mockResolvedValue(balance);
  const handler = createAdminClubClientsHandler({
    persistence: { listClients, getClient, getBalance }, studioId: 'bella-mujer'
  });
  return { handler, listClients, getClient, getBalance };
};

describe('administrative Club client read handler', () => {
  it('lists domain-only clients with the default or explicit bounded limit', async () => {
    const { handler, listClients } = setup();
    const first = await handler(listEvent());
    const second = await handler(listEvent({ limit: '25' }));
    const body = JSON.parse(first.body ?? '{}');
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(body).toEqual({ items: [client] });
    expect(JSON.stringify(body)).not.toMatch(/"(pk|sk|entityType)"/);
    expect(listClients).toHaveBeenNthCalledWith(1, 'bella-mujer', DEFAULT_CLUB_CLIENT_LIMIT, undefined);
    expect(listClients).toHaveBeenNthCalledWith(2, 'bella-mujer', 25, undefined);
  });

  it.each(['0', '101', '1.5', '-1', '', 'abc', ' 5'])('rejects malformed limit %j', async (limit) => {
    const { handler, listClients } = setup();
    expect((await handler(listEvent({ limit }))).statusCode).toBe(400);
    expect(listClients).not.toHaveBeenCalled();
  });

  it('round-trips an opaque client continuation token', async () => {
    const { handler, listClients } = setup();
    listClients.mockResolvedValueOnce({ items: [client], lastEvaluatedKey: key });
    const first = JSON.parse((await handler(listEvent())).body ?? '{}');
    expect(first.nextToken).toEqual(expect.any(String));
    expect(first.nextToken).not.toContain('STUDIO');
    expect((await handler(listEvent({ nextToken: first.nextToken }))).statusCode).toBe(200);
    expect(listClients).toHaveBeenNthCalledWith(2, 'bella-mujer', 50, key);
  });

  it.each([
    'not+a+token',
    Buffer.from('{bad json').toString('base64url'),
    Buffer.from(JSON.stringify({ pk: { S: 'STUDIO#other' }, sk: { S: `CLIENT#${id}` } })).toString('base64url'),
    Buffer.from(JSON.stringify({ pk: { S: 'STUDIO#bella-mujer' }, sk: { S: 'BALANCE' } })).toString('base64url'),
    Buffer.from(JSON.stringify({ pk: { S: 'GIFT_CARD#x' }, sk: { S: 'METADATA' } })).toString('base64url'),
    Buffer.from(JSON.stringify({ pk: { S: 'STUDIO#bella-mujer' }, sk: { S: 'VISIT#x' } })).toString('base64url')
  ])('rejects malformed or forged pagination token', async (nextToken) => {
    const { handler, listClients } = setup();
    expect((await handler(listEvent({ nextToken }))).statusCode).toBe(400);
    expect(listClients).not.toHaveBeenCalled();
  });

  it('returns client and balance detail using a normalized UUID', async () => {
    const { handler, getClient, getBalance } = setup();
    const response = await handler(detailEvent(id.toUpperCase()));
    const body = JSON.parse(response.body ?? '{}');
    expect(response.statusCode).toBe(200);
    expect(body).toEqual({ client, balance });
    expect(getClient).toHaveBeenCalledWith('bella-mujer', id);
    expect(getBalance).toHaveBeenCalledWith('bella-mujer', id);
    expect(JSON.stringify(body)).not.toMatch(/"(pk|sk|entityType)"/);
  });

  it.each([undefined, 'not-an-id', '#', ` ${id}`, `${id} `, 'CLIENT#x'])
  ('rejects unsafe detail ID %j before persistence', async (pathId) => {
    const { handler, getClient, getBalance } = setup();
    expect((await handler(detailEvent(pathId))).statusCode).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
    expect(getBalance).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing profile without fabricating a balance', async () => {
    const { handler, getClient, getBalance } = setup();
    getClient.mockResolvedValue(undefined);
    const response = await handler(detailEvent(id));
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body ?? '{}').error).toBe('CLUB_CLIENT_NOT_FOUND');
    expect(getBalance).not.toHaveBeenCalled();
  });

  it('returns 500 and logs safe metadata when a persisted balance is missing', async () => {
    const { handler, getBalance } = setup();
    getBalance.mockResolvedValue(undefined);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await handler(detailEvent(id));
    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(log.mock.calls)).toContain('invalid-client-aggregate');
    expect(JSON.stringify(log.mock.calls)).not.toContain(client.name);
    expect(JSON.stringify(log.mock.calls)).not.toContain(client.phone);
    log.mockRestore();
  });

  it.each(['list', 'detail'])('returns a safe 500 without logging PII on %s failure', async (kind) => {
    const privateError = `${client.name} ${client.phone}`;
    const error = Object.assign(new Error(privateError), {
      $metadata: { requestId: 'aws-request-id', httpStatusCode: 500 }
    });
    const { handler, listClients, getClient } = setup();
    if (kind === 'list') listClients.mockRejectedValue(error);
    else getClient.mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await handler(kind === 'list' ? listEvent() : detailEvent(id));
    const logged = JSON.stringify(log.mock.calls);
    expect(response.statusCode).toBe(500);
    expect(logged).toContain('api-request-id');
    expect(logged).toContain('aws-request-id');
    expect(logged).not.toContain(client.name);
    expect(logged).not.toContain(client.phone);
    log.mockRestore();
  });
});
