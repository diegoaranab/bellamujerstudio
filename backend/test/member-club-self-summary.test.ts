import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { ClubClient, LoyaltyBalance } from '../src/club/club-model';
import { createMemberClubSelfSummaryHandler } from '../src/handlers/member-club-self-summary';

const client: ClubClient = {
  studioId: 'bella-mujer', clientId: 'client-01', name: 'Clienta Ejemplo', phone: '+525500000000',
  status: 'active', createdAtISO: '2026-01-01T00:00:00.000Z', updatedAtISO: '2026-01-01T00:00:00.000Z'
};
const balance: LoyaltyBalance = {
  studioId: 'bella-mujer', clientId: 'client-01', stampCount: 3, eligibleSpendCarryMXN: 200,
  version: 7, updatedAtISO: '2026-01-01T00:00:00.000Z'
};

const event = (lambda?: unknown): APIGatewayProxyEventV2 => ({
  version: '2.0', routeKey: 'GET /club/me', rawPath: '/club/me', rawQueryString: '', headers: {},
  requestContext: {
    requestId: 'member-summary-request',
    ...(lambda === undefined ? {} : { authorizer: { lambda } })
  } as APIGatewayProxyEventV2['requestContext'],
  isBase64Encoded: false
});

describe('member Club self summary', () => {
  it('returns only the authenticated member name and current stamp count', async () => {
    const persistence = {
      getClient: vi.fn().mockResolvedValue(client),
      getBalance: vi.fn().mockResolvedValue(balance)
    };
    const response = await createMemberClubSelfSummaryHandler({ persistence })(
      event({ studioId: 'bella-mujer', clientId: 'client-01' })
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      profile: { name: 'Clienta Ejemplo' }, loyalty: { stampCount: 3 }
    });
    for (const forbidden of [
      'phone', 'clientId', 'studioId', 'eligibleSpendCarryMXN', 'version', 'createdAtISO', 'updatedAtISO'
    ]) expect(response.body).not.toContain(forbidden);
  });

  it('uses trusted authorizer identity even when request identifiers are adversarial', async () => {
    const persistence = {
      getClient: vi.fn().mockResolvedValue(client),
      getBalance: vi.fn().mockResolvedValue(balance)
    };
    const response = await createMemberClubSelfSummaryHandler({ persistence })({
      ...event({ studioId: 'bella-mujer', clientId: 'client-01' }),
      rawQueryString: 'clientId=someone-else&studioId=another-studio',
      queryStringParameters: { clientId: 'someone-else', studioId: 'another-studio' },
      pathParameters: { id: 'someone-else' },
      body: JSON.stringify({ clientId: 'someone-else', studioId: 'another-studio' })
    });

    expect(response.statusCode).toBe(200);
    expect(persistence.getClient).toHaveBeenCalledWith('bella-mujer', 'client-01');
    expect(persistence.getBalance).toHaveBeenCalledWith('bella-mujer', 'client-01');
  });

  it.each([
    ['missing profile', undefined, balance, { studioId: 'bella-mujer', clientId: 'client-01' }],
    ['missing balance', client, undefined, { studioId: 'bella-mujer', clientId: 'client-01' }],
    ['missing trusted context', client, balance, undefined]
  ])('fails safely for %s', async (_name, profile, persistedBalance, context) => {
    const persistence = {
      getClient: vi.fn().mockResolvedValue(profile),
      getBalance: vi.fn().mockResolvedValue(persistedBalance)
    };
    const response = await createMemberClubSelfSummaryHandler({ persistence })(event(context));

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      error: 'SERVER_ERROR',
      message: 'No pudimos cargar tu información de Bella Mujer Club. Intenta de nuevo en unos minutos.'
    });
    expect(response.body).not.toContain('client-01');
    expect(response.body).not.toContain('eligibleSpendCarryMXN');
  });
});
