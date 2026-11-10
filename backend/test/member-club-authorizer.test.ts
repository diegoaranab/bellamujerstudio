import { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { digestSecret } from '../src/club-access/club-access-crypto';
import {
  AccessSession,
  MemberAccessState,
  PinVerifierMetadata
} from '../src/club-access/club-access-model';
import { createMemberClubAuthorizerHandler } from '../src/handlers/member-club-authorizer';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const TOKEN = Buffer.alloc(32, 9).toString('base64url');
const DIGEST = digestSecret(TOKEN);

const verifier: PinVerifierMetadata = {
  algorithm: 'HMAC-SHA256+SCRYPT', kdfVersion: 1,
  saltBase64Url: Buffer.alloc(32, 1).toString('base64url'),
  verifierBase64Url: Buffer.alloc(32, 2).toString('base64url'),
  pepperVersion: 'v1', N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024,
  keyLength: 32, createdAtISO: '2026-11-10T10:00:00.000Z',
  updatedAtISO: '2026-11-10T10:00:00.000Z'
};

const session: AccessSession = {
  sessionDigest: DIGEST, studioId: 'bella-mujer', clientId: 'client-01',
  credentialVersion: 3, createdAtISO: '2026-11-10T11:00:00.000Z',
  expiresAtISO: '2026-11-10T19:00:00.000Z', expiresAtEpoch: 1794337200,
  revoked: false
};

const state: MemberAccessState = {
  studioId: 'bella-mujer', clientId: 'client-01', handleDigest: 'a'.repeat(64),
  accessStatus: 'active', credentialVersion: 3, invitationGeneration: 1,
  failedPinAttempts: 0, pinVerifier: verifier,
  createdAtISO: '2026-11-10T10:00:00.000Z',
  updatedAtISO: '2026-11-10T11:00:00.000Z'
};

const event = (authorization?: string): APIGatewayRequestAuthorizerEventV2 => ({
  version: '2.0', type: 'REQUEST', routeArn: 'arn:aws:execute-api:example',
  identitySource: authorization ? [authorization] : [], routeKey: 'GET /club/access/session',
  rawPath: '/club/access/session', rawQueryString: '', cookies: [],
  headers: authorization ? { authorization } : {},
  requestContext: { requestId: 'authorizer-request' } as
    APIGatewayRequestAuthorizerEventV2['requestContext']
});

describe('member Club session authorizer', () => {
  const getSession = vi.fn();
  const getMemberAccess = vi.fn();
  const handler = createMemberClubAuthorizerHandler({
    persistence: { getSession, getMemberAccess },
    clock: () => new Date(NOW)
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue(session);
    getMemberAccess.mockResolvedValue(state);
  });

  it('authorizes a valid session with exact minimal trusted context', async () => {
    const result = await handler(event(`bEaReR ${TOKEN}`));

    expect(result).toEqual({
      isAuthorized: true,
      context: { studioId: 'bella-mujer', clientId: 'client-01' }
    });
    expect(getSession).toHaveBeenCalledOnce();
    expect(getSession).toHaveBeenCalledWith(DIGEST);
    expect(getSession).not.toHaveBeenCalledWith(TOKEN);
    expect(getMemberAccess).toHaveBeenCalledWith('client-01');
  });

  it.each([
    ['missing bearer header', undefined],
    ['wrong scheme', TOKEN],
    ['multiple credentials', `Bearer ${TOKEN}, Bearer ${TOKEN}`],
    ['non-canonical token', `Bearer ${TOKEN}=`],
    ['arbitrary token', 'Bearer not_canonical']
  ])('denies %s without reading DynamoDB', async (_name, authorization) => {
    expect(await handler(event(authorization))).toEqual({ isAuthorized: false });
    expect(getSession).not.toHaveBeenCalled();
    expect(getMemberAccess).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown session', undefined],
    ['successful logout revocation', { ...session, revoked: true, revokedAtISO: NOW.toISOString() }],
    ['revocation timestamp on row', { ...session, revokedAtISO: NOW.toISOString() }],
    ['logical expiry', { ...session, expiresAtISO: NOW.toISOString() }]
  ])('denies %s before reading member access', async (_name, stored) => {
    getSession.mockResolvedValue(stored);
    expect(await handler(event(`Bearer ${TOKEN}`))).toEqual({ isAuthorized: false });
    expect(getMemberAccess).not.toHaveBeenCalled();
  });

  it('denies a missing member-access state', async () => {
    getMemberAccess.mockResolvedValue(undefined);
    expect(await handler(event(`Bearer ${TOKEN}`))).toEqual({ isAuthorized: false });
  });

  it.each([
    ['invited state', { accessStatus: 'invited' }],
    ['disabled state', { accessStatus: 'disabled' }],
    ['studio identity mismatch', { studioId: 'another-studio' }],
    ['client identity mismatch', { clientId: 'client-02' }],
    ['active state without PIN verifier', { pinVerifier: undefined }]
  ] as const)('denies %s', async (_name, change) => {
    getMemberAccess.mockResolvedValue({ ...state, ...change });
    expect(await handler(event(`Bearer ${TOKEN}`))).toEqual({ isAuthorized: false });
  });

  it('denies an old session after administrator full reset increments credentialVersion', async () => {
    getSession.mockResolvedValue({ ...session, credentialVersion: 3 });
    getMemberAccess.mockResolvedValue({ ...state, credentialVersion: 4 });

    expect(await handler(event(`Bearer ${TOKEN}`))).toEqual({ isAuthorized: false });
    expect(getMemberAccess).toHaveBeenCalledWith(session.clientId);
  });

  it('does not log credentials for ordinary denials', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getSession.mockResolvedValue({ ...session, revoked: true, revokedAtISO: NOW.toISOString() });

    expect(await handler(event(`Bearer ${TOKEN}`))).toEqual({ isAuthorized: false });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('fails closed and logs only safe metadata for unexpected persistence errors', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getSession.mockRejectedValue(new Error(`sensitive ${TOKEN} ${DIGEST}`));

    await expect(handler(event(`Bearer ${TOKEN}`))).rejects.toThrow();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(DIGEST);
    expect(logged).toContain('authorizer-request');
    log.mockRestore();
  });

  it('rejects an invalid injected server clock before reading member access', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const invalidClockHandler = createMemberClubAuthorizerHandler({
      persistence: { getSession, getMemberAccess },
      clock: () => new Date(Number.NaN)
    });

    await expect(invalidClockHandler(event(`Bearer ${TOKEN}`)))
      .rejects.toThrow('Invalid member authorizer clock');
    expect(getMemberAccess).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
