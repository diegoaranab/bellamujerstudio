import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { createMemberClubSessionHandler } from '../src/handlers/member-club-session';

const event = (lambda?: unknown): APIGatewayProxyEventV2 => ({
  version: '2.0', routeKey: 'GET /club/access/session', rawPath: '/club/access/session',
  rawQueryString: '', headers: {},
  requestContext: {
    requestId: 'session-probe-request',
    ...(lambda === undefined ? {} : { authorizer: { lambda } })
  } as APIGatewayProxyEventV2['requestContext'],
  isBase64Encoded: false
});

describe('member Club session probe', () => {
  const handler = createMemberClubSessionHandler();

  it('returns only authenticated true for valid trusted authorizer context', async () => {
    const response = await handler(event({ studioId: 'bella-mujer', clientId: 'client-01' }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toEqual({ authenticated: true });
    expect(response.body).not.toContain('client-01');
    expect(response.body).not.toContain('bella-mujer');
  });

  it.each([
    ['missing context', undefined],
    ['missing clientId', { studioId: 'bella-mujer' }],
    ['non-scalar clientId', { studioId: 'bella-mujer', clientId: ['client-01'] }],
    ['invalid studioId', { studioId: 'bella#mujer', clientId: 'client-01' }]
  ])('fails safely for %s', async (_name, context) => {
    const response = await handler(event(context));
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      error: 'SERVER_ERROR',
      message: 'No pudimos validar la sesión. Intenta de nuevo en unos minutos.'
    });
    expect(response.body).not.toContain('client-01');
  });

  it('never falls back to member identity supplied by the request', async () => {
    const untrustedEvent: APIGatewayProxyEventV2 = {
      ...event(),
      queryStringParameters: { clientId: 'client-01' },
      pathParameters: { clientId: 'client-01' },
      body: JSON.stringify({ studioId: 'bella-mujer', clientId: 'client-01' })
    };

    const response = await handler(untrustedEvent);
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('client-01');
  });
});
