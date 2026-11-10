import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import {
  AdminClubClientCreateHandlerDependencies,
  ClubClientCreatePersistence,
  createAdminClubClientCreateHandler,
  MAX_CLUB_CLIENT_CREATE_BODY_BYTES
} from '../src/handlers/admin-club-client-create';

const id = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const normalizedId = id.toLowerCase();
const nowISO = '2026-11-09T18:00:00.000Z';

const eventFor = (body: unknown, base64 = false): APIGatewayProxyEventV2 => ({
  headers: { origin: 'http://localhost:4200' },
  body: body === undefined ? undefined : base64
    ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64')
    : typeof body === 'string' ? body : JSON.stringify(body),
  isBase64Encoded: base64,
  requestContext: { requestId: 'api-request-id' }
}) as unknown as APIGatewayProxyEventV2;

const setup = (overrides: Partial<AdminClubClientCreateHandlerDependencies> = {}) => {
  const createClient = vi.fn<ClubClientCreatePersistence['createClient']>().mockResolvedValue();
  const handler = createAdminClubClientCreateHandler({
    persistence: { createClient },
    studioId: 'bella-mujer',
    clock: () => new Date(nowISO),
    createClientId: () => id,
    ...overrides
  });
  return { handler, createClient };
};

describe('administrative Club client creation handler', () => {
  it.each([false, true])('creates an atomic profile and zero balance (base64: %s)', async (base64) => {
    const { handler, createClient } = setup();
    const response = await handler(eventFor({ name: '  Ana María  ', phone: '  +52 55 1234 5678  ' }, base64));
    const body = JSON.parse(response.body ?? '{}');

    expect(response.statusCode).toBe(201);
    expect(body).toEqual({
      client: {
        studioId: 'bella-mujer', clientId: normalizedId, name: 'Ana María',
        phone: '+52 55 1234 5678', status: 'active', createdAtISO: nowISO, updatedAtISO: nowISO
      },
      balance: {
        studioId: 'bella-mujer', clientId: normalizedId, stampCount: 0,
        eligibleSpendCarryMXN: 0, version: 0, updatedAtISO: nowISO
      }
    });
    expect(createClient).toHaveBeenCalledWith(body.client, body.balance);
    expect(new Set([
      body.client.createdAtISO, body.client.updatedAtISO, body.balance.updatedAtISO
    ])).toEqual(new Set([nowISO]));
    expect(JSON.stringify(body)).not.toMatch(/"(pk|sk|entityType)"/);
  });

  it.each([
    [{ name: '', phone: '55' }],
    [{ name: '   ', phone: '55' }],
    [{ name: 'x'.repeat(201), phone: '55' }],
    [{ name: 'Ana\nMaría', phone: '55' }],
    [{ name: 'Ana', phone: '' }],
    [{ name: 'Ana', phone: 'x'.repeat(51) }],
    [{ name: 'Ana', phone: '55\u0000' }],
    [{ name: 'Ana', phone: '55', studioId: 'other' }],
    [{ name: 'Ana', phone: '55', status: 'inactive' }],
    [{ name: 'Ana', phone: '55', clientId: normalizedId }],
    [{ name: 'Ana', phone: '55', unknown: true }],
    [{ name: 'Ana' }],
    [null],
    [[]],
    [undefined],
    ['{bad json']
  ])('rejects malformed or server-owned input %j', async (body) => {
    const { handler, createClient } = setup();
    expect((await handler(eventFor(body))).statusCode).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('uses Unicode characters, not UTF-16 code units, for field limits', async () => {
    const { handler } = setup();
    expect((await handler(eventFor({ name: '💅'.repeat(200), phone: '55' }))).statusCode).toBe(201);
  });

  it('rejects an oversized body before persistence', async () => {
    const { handler, createClient } = setup();
    const response = await handler(eventFor(JSON.stringify({
      name: 'Ana', phone: 'x'.repeat(MAX_CLUB_CLIENT_CREATE_BODY_BYTES)
    })));
    expect(response.statusCode).toBe(413);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('returns a safe error and never logs client PII', async () => {
    const privateText = 'Ana Privada +52 55 0000 0000';
    const error = Object.assign(new Error(privateText), {
      $metadata: { requestId: 'aws-request-id', httpStatusCode: 500 }
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handler } = setup({ persistence: { createClient: vi.fn().mockRejectedValue(error) } });
    const response = await handler(eventFor({ name: 'Ana Privada', phone: '+52 55 0000 0000' }));
    const logged = JSON.stringify(log.mock.calls);

    expect(response.statusCode).toBe(500);
    expect(logged).toContain('create-client');
    expect(logged).toContain('api-request-id');
    expect(logged).toContain('aws-request-id');
    expect(logged).not.toContain('Ana Privada');
    expect(logged).not.toContain('+52 55 0000 0000');
    log.mockRestore();
  });
});
