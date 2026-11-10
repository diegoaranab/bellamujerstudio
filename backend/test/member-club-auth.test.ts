import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { failedPinTransition, SESSION_LIFETIME_MS } from '../src/club-access/club-access-auth';
import { digestSecret } from '../src/club-access/club-access-crypto';
import {
  AccessInvitation,
  HandleLookup,
  MemberAccessState,
  PinVerifierMetadata
} from '../src/club-access/club-access-model';
import {
  MemberAuthPersistence,
  createMemberClubAuthHandler
} from '../src/handlers/member-club-auth';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const HANDLE = Buffer.alloc(32, 1).toString('base64url');
const INVITATION = Buffer.alloc(32, 2).toString('base64url');
const SESSION = Buffer.alloc(32, 3).toString('base64url');
const HANDLE_DIGEST = digestSecret(HANDLE);
const INVITATION_DIGEST = digestSecret(INVITATION);

const verifier: PinVerifierMetadata = {
  algorithm: 'HMAC-SHA256+SCRYPT', kdfVersion: 1,
  saltBase64Url: Buffer.alloc(32, 4).toString('base64url'),
  verifierBase64Url: Buffer.alloc(32, 5).toString('base64url'),
  pepperVersion: 'v1', N: 16, r: 1, p: 1, maxmem: 1024 * 1024, keyLength: 32,
  createdAtISO: NOW.toISOString(), updatedAtISO: NOW.toISOString()
};

const invitedState: MemberAccessState = {
  studioId: 'bella-mujer', clientId: 'client-01', handleDigest: HANDLE_DIGEST,
  accessStatus: 'invited', credentialVersion: 0, invitationGeneration: 1,
  failedPinAttempts: 0, createdAtISO: '2026-11-09T12:00:00.000Z',
  updatedAtISO: '2026-11-09T12:00:00.000Z'
};
const invitedLookup: HandleLookup = {
  handleDigest: HANDLE_DIGEST, studioId: 'bella-mujer', clientId: 'client-01',
  accessStatus: 'invited', credentialVersion: 0,
  createdAtISO: '2026-11-09T12:00:00.000Z', updatedAtISO: '2026-11-09T12:00:00.000Z'
};
const invitation: AccessInvitation = {
  invitationDigest: INVITATION_DIGEST, studioId: 'bella-mujer', clientId: 'client-01',
  handleDigest: HANDLE_DIGEST, generation: 1, createdAtISO: '2026-11-09T12:00:00.000Z',
  expiresAtISO: '2026-11-16T12:00:00.000Z', expiresAtEpoch: 1794830400,
  consumed: false
};
const activeState: MemberAccessState = {
  ...invitedState, accessStatus: 'active', pinVerifier: verifier,
  updatedAtISO: '2026-11-09T12:05:00.000Z'
};
const activeLookup: HandleLookup = {
  ...invitedLookup, accessStatus: 'active', updatedAtISO: '2026-11-09T12:05:00.000Z'
};

const event = (routeKey: string, body: unknown): APIGatewayProxyEventV2 => ({
  version: '2.0', routeKey, rawPath: '', rawQueryString: '', headers: {},
  requestContext: { requestId: 'request-01' } as APIGatewayProxyEventV2['requestContext'],
  isBase64Encoded: false, body: JSON.stringify(body)
});

const responseBody = (response: { body?: string }) => JSON.parse(response.body ?? '{}');
const canceled = () => Object.assign(new Error('synthetic'), {
  name: 'TransactionCanceledException',
  CancellationReasons: [{ Code: 'ConditionalCheckFailed' }]
});

describe('failed PIN backoff policy', () => {
  it.each([
    [0, undefined], [1, undefined], [2, '2026-11-10T12:00:30.000Z'],
    [3, '2026-11-10T12:02:00.000Z'], [4, '2026-11-10T12:10:00.000Z'],
    [5, '2026-11-10T13:00:00.000Z'], [6, '2026-11-10T13:00:00.000Z']
  ])('maps existing failure count %i to the selected delay', (existing, nextAllowedAtISO) => {
    expect(failedPinTransition(existing, NOW)).toEqual({
      failedPinAttempts: existing + 1,
      ...(nextAllowedAtISO ? { nextAllowedAtISO } : {})
    });
  });
});

describe('member Club enrollment and login handler', () => {
  const completeEnrollment = vi.fn();
  const recordFailedPinAttempt = vi.fn();
  const completeSuccessfulLogin = vi.fn();
  const getHandleLookup = vi.fn();
  const getInvitation = vi.fn();
  const getMemberAccess = vi.fn();
  const getPepper = vi.fn();
  const derive = vi.fn();
  const verify = vi.fn();
  const persistence: MemberAuthPersistence = {
    getHandleLookup, getInvitation, getMemberAccess,
    completeEnrollment, recordFailedPinAttempt, completeSuccessfulLogin
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getPepper.mockResolvedValue('synthetic-pepper');
    derive.mockResolvedValue(verifier);
    verify.mockResolvedValue(true);
    completeEnrollment.mockResolvedValue(undefined);
    recordFailedPinAttempt.mockResolvedValue(undefined);
    completeSuccessfulLogin.mockResolvedValue(undefined);
  });

  const handler = (clock = () => new Date(NOW)) => createMemberClubAuthHandler({
    persistence,
    pepperProvider: { getPepper },
    pepperVersion: 'v1',
    clock,
    sessionTokenGenerator: () => SESSION,
    crypto: { derive, verify },
    allowedOrigins: []
  });

  it('atomically activates an invitation without incrementing its credential version', async () => {
    getHandleLookup.mockResolvedValue(invitedLookup);
    getInvitation.mockResolvedValue(invitation);
    getMemberAccess.mockResolvedValue(invitedState);

    const response = await handler()(event('POST /club/access/enroll', {
      accessHandle: HANDLE, invitationToken: INVITATION, pin: '482731'
    }));

    expect(response.statusCode).toBe(201);
    expect(responseBody(response)).toEqual({
      session: { token: SESSION, expiresAtISO: '2026-11-10T20:00:00.000Z' }
    });
    expect(completeEnrollment).toHaveBeenCalledOnce();
    const [expectedState, expectedHandle, expectedInvite, nextState, nextHandle,
      consumedInvite, session] = completeEnrollment.mock.calls[0];
    expect(expectedState).toEqual(invitedState);
    expect(expectedHandle).toEqual(invitedLookup);
    expect(expectedInvite).toEqual(invitation);
    expect(nextState).toMatchObject({
      accessStatus: 'active', credentialVersion: 0, invitationGeneration: 1,
      failedPinAttempts: 0, pinVerifier: verifier
    });
    expect(nextHandle).toMatchObject({ accessStatus: 'active', credentialVersion: 0 });
    expect(consumedInvite).toMatchObject({ consumed: true, consumedAtISO: NOW.toISOString() });
    expect(session).toMatchObject({
      sessionDigest: digestSecret(SESSION), credentialVersion: 0, revoked: false,
      expiresAtISO: '2026-11-10T20:00:00.000Z'
    });
    expect(new Date(session.expiresAtISO).getTime() - NOW.getTime()).toBe(SESSION_LIFETIME_MS);
    expect(JSON.stringify(completeEnrollment.mock.calls[0])).not.toContain(SESSION);
    expect(JSON.stringify(completeEnrollment.mock.calls[0])).not.toContain(INVITATION);
    expect(JSON.stringify(completeEnrollment.mock.calls[0])).not.toContain(HANDLE);
    expect(JSON.stringify(completeEnrollment.mock.calls[0])).not.toContain('482731');
  });

  it.each([
    ['missing handle', undefined, invitation, invitedState],
    ['missing invitation', invitedLookup, undefined, invitedState],
    ['expired invitation', invitedLookup, { ...invitation, expiresAtISO: NOW.toISOString() }, invitedState],
    ['consumed invitation', invitedLookup, { ...invitation, consumed: true, consumedAtISO: NOW.toISOString() }, invitedState],
    ['superseded invitation', invitedLookup, { ...invitation, generation: 2 }, invitedState],
    ['mismatched state', invitedLookup, invitation, { ...invitedState, studioId: 'other' }]
  ])('returns one generic invitation error for %s', async (_name, lookup, invite, state) => {
    getHandleLookup.mockResolvedValue(lookup);
    getInvitation.mockResolvedValue(invite);
    getMemberAccess.mockResolvedValue(state);
    const response = await handler()(event('POST /club/access/enroll', {
      accessHandle: HANDLE, invitationToken: INVITATION, pin: '482731'
    }));
    expect(response.statusCode).toBe(400);
    expect(responseBody(response).error).toBe('CLUB_ACCESS_INVITATION_INVALID');
    expect(derive).not.toHaveBeenCalled();
    expect(completeEnrollment).not.toHaveBeenCalled();
  });

  it('rejects weak PINs distinctly before loading access records', async () => {
    const response = await handler()(event('POST /club/access/enroll', {
      accessHandle: HANDLE, invitationToken: INVITATION, pin: '123456'
    }));
    expect(response.statusCode).toBe(400);
    expect(responseBody(response).error).toBe('CLUB_PIN_INVALID');
    expect(getHandleLookup).not.toHaveBeenCalled();
  });

  it('maps a concurrent invitation consumption or commit-time expiry to the generic error', async () => {
    getHandleLookup.mockResolvedValue(invitedLookup);
    getInvitation.mockResolvedValue(invitation);
    getMemberAccess.mockResolvedValue(invitedState);
    completeEnrollment.mockRejectedValue(canceled());
    const response = await handler()(event('POST /club/access/enroll', {
      accessHandle: HANDLE, invitationToken: INVITATION, pin: '482731'
    }));
    expect(responseBody(response).error).toBe('CLUB_ACCESS_INVITATION_INVALID');
  });

  it('creates a session and atomically resets exact verified failure state on login', async () => {
    const state = { ...activeState, failedPinAttempts: 4,
      nextAllowedAtISO: '2026-11-10T11:59:59.000Z' };
    getHandleLookup.mockResolvedValue(activeLookup);
    getMemberAccess.mockResolvedValue(state);
    const response = await handler()(event('POST /club/access/login', {
      accessHandle: HANDLE, pin: '482731'
    }));
    expect(response.statusCode).toBe(200);
    expect(responseBody(response).session.token).toBe(SESSION);
    expect(completeSuccessfulLogin).toHaveBeenCalledOnce();
    const [expected, next, session] = completeSuccessfulLogin.mock.calls[0];
    expect(expected).toEqual(state);
    expect(next.failedPinAttempts).toBe(0);
    expect(next.nextAllowedAtISO).toBeUndefined();
    expect(session.credentialVersion).toBe(state.credentialVersion);
  });

  it.each(['unknown', 'invited', 'disabled'])('uses generic login failure for %s access', async (kind) => {
    getHandleLookup.mockResolvedValue(kind === 'unknown' ? undefined : {
      ...activeLookup, accessStatus: kind === 'invited' ? 'invited' : 'disabled'
    });
    getMemberAccess.mockResolvedValue({
      ...activeState, accessStatus: kind === 'invited' ? 'invited' : 'disabled'
    });
    const response = await handler()(event('POST /club/access/login', {
      accessHandle: HANDLE, pin: '482731'
    }));
    expect(response.statusCode).toBe(401);
    expect(responseBody(response).error).toBe('CLUB_ACCESS_AUTHENTICATION_FAILED');
    expect(verify).not.toHaveBeenCalled();
  });

  it('enforces an active throttle before loading pepper or running KDF', async () => {
    getHandleLookup.mockResolvedValue(activeLookup);
    getMemberAccess.mockResolvedValue({
      ...activeState, failedPinAttempts: 3, nextAllowedAtISO: '2026-11-10T12:00:30.000Z'
    });
    const response = await handler()(event('POST /club/access/login', {
      accessHandle: HANDLE, pin: '482731'
    }));
    expect(response.statusCode).toBe(429);
    expect(responseBody(response)).toMatchObject({
      error: 'CLUB_ACCESS_THROTTLED', retryAfterSeconds: 30
    });
    expect(getPepper).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(recordFailedPinAttempt).not.toHaveBeenCalled();
  });

  it('records a wrong PIN and retries a lost CAS without losing the concurrent increment', async () => {
    const current = { ...activeState, failedPinAttempts: 1,
      updatedAtISO: '2026-11-10T12:00:01.000Z' };
    getHandleLookup.mockResolvedValue(activeLookup);
    getMemberAccess.mockResolvedValueOnce(activeState).mockResolvedValueOnce(current);
    verify.mockResolvedValue(false);
    recordFailedPinAttempt.mockRejectedValueOnce(canceled()).mockResolvedValueOnce(undefined);
    const response = await handler()(event('POST /club/access/login', {
      accessHandle: HANDLE, pin: '482730'
    }));
    expect(responseBody(response).error).toBe('CLUB_ACCESS_AUTHENTICATION_FAILED');
    expect(verify).toHaveBeenCalledOnce();
    expect(recordFailedPinAttempt).toHaveBeenCalledTimes(2);
    expect(recordFailedPinAttempt.mock.calls[1][0].failedPinAttempts).toBe(1);
    expect(recordFailedPinAttempt.mock.calls[1][1].failedPinAttempts).toBe(2);
  });

  it('does not apply an old failed attempt after the credential changes', async () => {
    getHandleLookup.mockResolvedValue(activeLookup);
    getMemberAccess.mockResolvedValueOnce(activeState).mockResolvedValueOnce({
      ...activeState, credentialVersion: 1
    });
    verify.mockResolvedValue(false);
    recordFailedPinAttempt.mockRejectedValueOnce(canceled());
    const response = await handler()(event('POST /club/access/login', {
      accessHandle: HANDLE, pin: '482730'
    }));
    expect(responseBody(response).error).toBe('CLUB_ACCESS_AUTHENTICATION_FAILED');
    expect(recordFailedPinAttempt).toHaveBeenCalledOnce();
  });

  it('does not retry a stale successful reset over newer failure state', async () => {
    getHandleLookup.mockResolvedValue(activeLookup);
    getMemberAccess.mockResolvedValue(activeState);
    completeSuccessfulLogin.mockRejectedValue(canceled());
    const response = await handler()(event('POST /club/access/login', {
      accessHandle: HANDLE, pin: '482731'
    }));
    expect(response.statusCode).toBe(409);
    expect(responseBody(response).error).toBe('CLUB_ACCESS_CONCURRENT_UPDATE');
    expect(completeSuccessfulLogin).toHaveBeenCalledOnce();
  });

  it('returns a safe server error when the pepper provider fails without logging the secret', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getHandleLookup.mockResolvedValue(activeLookup);
    getMemberAccess.mockResolvedValue(activeState);
    getPepper.mockRejectedValue(new Error('synthetic secret value must not appear'));
    const response = await handler()(event('POST /club/access/login', {
      accessHandle: HANDLE, pin: '482731'
    }));
    expect(response.statusCode).toBe(500);
    expect(responseBody(response).error).toBe('SERVER_ERROR');
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic secret value');
    log.mockRestore();
  });

  it('rejects unknown fields and oversized bodies', async () => {
    const unknown = await handler()(event('POST /club/access/login', {
      accessHandle: HANDLE, pin: '482731', clientId: 'client-01'
    }));
    expect(unknown.statusCode).toBe(400);
    const oversized = event('POST /club/access/login', {
      accessHandle: HANDLE, pin: '482731', padding: 'x'.repeat(2000)
    });
    expect((await handler()(oversized)).statusCode).toBe(413);
  });
});
