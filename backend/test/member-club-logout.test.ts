import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { digestSecret } from '../src/club-access/club-access-crypto';
import { AccessSession } from '../src/club-access/club-access-model';
import { createMemberClubLogoutHandler } from '../src/handlers/member-club-logout';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const TOKEN = Buffer.alloc(32, 8).toString('base64url');
const session: AccessSession = {
  sessionDigest: digestSecret(TOKEN), studioId: 'bella-mujer', clientId: 'client-01',
  credentialVersion: 2, createdAtISO: '2026-11-10T11:00:00.000Z',
  expiresAtISO: '2026-11-10T19:00:00.000Z', expiresAtEpoch: 1794337200,
  revoked: false
};

const event = (authorization?: string): APIGatewayProxyEventV2 => ({
  version: '2.0', routeKey: 'POST /club/access/logout', rawPath: '', rawQueryString: '',
  headers: authorization ? { authorization } : {},
  requestContext: { requestId: 'logout-request' } as APIGatewayProxyEventV2['requestContext'],
  isBase64Encoded: false
});
const canceled = () => Object.assign(new Error('synthetic'), {
  name: 'TransactionCanceledException',
  CancellationReasons: [{ Code: 'ConditionalCheckFailed' }]
});

describe('member Club logout handler', () => {
  const getSession = vi.fn();
  const revokeSession = vi.fn();
  const handler = createMemberClubLogoutHandler({
    persistence: { getSession, revokeSession },
    clock: () => new Date(NOW),
    allowedOrigins: []
  });

  beforeEach(() => {
    vi.clearAllMocks();
    revokeSession.mockResolvedValue(undefined);
  });

  it('conditionally revokes a current session using server time', async () => {
    getSession.mockResolvedValue(session);
    const response = await handler(event(`Bearer ${TOKEN}`));
    expect(response.statusCode).toBe(204);
    expect(getSession).toHaveBeenCalledWith(digestSecret(TOKEN));
    expect(revokeSession).toHaveBeenCalledWith(session, {
      ...session, revoked: true, revokedAtISO: NOW.toISOString()
    });
  });

  it.each([
    ['missing token', undefined, undefined],
    ['malformed token', 'Bearer not_canonical', undefined],
    ['missing session', `Bearer ${TOKEN}`, undefined],
    ['revoked session', `Bearer ${TOKEN}`, { ...session, revoked: true, revokedAtISO: NOW.toISOString() }],
    ['expired session', `Bearer ${TOKEN}`, { ...session, expiresAtISO: NOW.toISOString() }]
  ])('returns non-disclosing success for %s', async (_name, authorization, stored) => {
    getSession.mockResolvedValue(stored);
    const response = await handler(event(authorization));
    expect(response.statusCode).toBe(204);
    expect(response.body).toBeUndefined();
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it('treats a conditional revoke race as idempotent success', async () => {
    getSession.mockResolvedValue(session);
    revokeSession.mockRejectedValue(canceled());
    expect((await handler(event(`Bearer ${TOKEN}`))).statusCode).toBe(204);
  });

  it('returns safe 500 for unexpected persistence failure without logging tokens', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getSession.mockRejectedValue(new Error(`do not log ${TOKEN}`));
    const response = await handler(event(`Bearer ${TOKEN}`));
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body ?? '{}').error).toBe('SERVER_ERROR');
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
    log.mockRestore();
  });
});
