import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../src/handlers/member-club-qr';

const clientId = 'ba8beeca-8a39-4ed1-9e9f-e38e9f55cda1';
const event = (overrides: Record<string, unknown> = {}): APIGatewayProxyEventV2 => ({
  version: '2.0',
  routeKey: 'GET /club/me/qr',
  rawPath: '/club/me/qr',
  rawQueryString: '',
  headers: {},
  requestContext: {
    accountId: '123456789012',
    apiId: 'api',
    domainName: 'example.test',
    domainPrefix: 'example',
    http: {
      method: 'GET',
      path: '/club/me/qr',
      protocol: 'HTTP/1.1',
      sourceIp: '127.0.0.1',
      userAgent: 'test'
    },
    requestId: 'request-id',
    routeKey: 'GET /club/me/qr',
    stage: '$default',
    time: '18/Nov/2026:12:00:00 +0000',
    timeEpoch: 1795003200000,
    ...((overrides.requestContext as object | undefined) ?? {})
  },
  isBase64Encoded: false,
  ...overrides
} as APIGatewayProxyEventV2);

const trustedEvent = (clientIdentifier = clientId): APIGatewayProxyEventV2 => event({
  requestContext: {
    authorizer: { lambda: { studioId: 'bella-mujer', clientId: clientIdentifier } }
  }
});

afterEach(() => vi.restoreAllMocks());

describe('GET /club/me/qr handler', () => {
  it('returns only the authenticated member QR identifier', async () => {
    const response = await handler(trustedEvent());
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ qr: { identifier: clientId } });
    for (const forbidden of [
      'studioId', 'clientId', 'name', 'phone', 'accessHandle', 'session',
      'credentialVersion', 'pk', 'sk', 'email', 'status', 'balance', 'stampCount',
      'invitation', 'PIN'
    ]) expect(response.body).not.toContain(forbidden);
  });

  it('returns a generic server error when trusted member context is missing', async () => {
    const response = await handler(event());
    expect(response.statusCode).toBe(500);
    expect(response.body).toBe(JSON.stringify({
      error: 'SERVER_ERROR',
      message: 'No pudimos cargar tu identificación de Bella Mujer Club. Intenta de nuevo en unos minutos.'
    }));
  });

  it('rejects malformed or noncanonical UUIDs without reflecting them', async () => {
    const malformed = 'not-a-member-id';
    const response = await handler(trustedEvent(malformed));
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain(malformed);
    expect(response.body).toContain('SERVER_ERROR');
  });

  it('ignores all client-controlled identity selectors', async () => {
    const response = await handler(event({
      requestContext: {
        authorizer: { lambda: { studioId: 'bella-mujer', clientId } }
      },
      queryStringParameters: { clientId: '11111111-1111-4111-8111-111111111111' },
      pathParameters: { clientId: '22222222-2222-4222-8222-222222222222' },
      headers: { clientId: '33333333-3333-4333-8333-333333333333' },
      body: JSON.stringify({ clientId: '44444444-4444-4444-8444-444444444444' })
    }));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ qr: { identifier: clientId } });
  });

  it('logs only safe operation metadata on context and UUID failures', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secretIdentifier = 'private-invalid-client-value';
    await handler(trustedEvent(secretIdentifier));
    await handler(event({
      requestContext: {
        authorizer: { lambda: { studioId: 'hidden-studio', clientId: secretIdentifier } }
      }
    }));

    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).toContain('member-qr-identification');
    for (const forbidden of [secretIdentifier, 'hidden-studio', 'clientId', 'studioId']) {
      expect(logged).not.toContain(forbidden);
    }
  });
});
