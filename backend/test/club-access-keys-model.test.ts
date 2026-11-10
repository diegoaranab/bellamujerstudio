import { describe, expect, it } from 'vitest';
import {
  handleLookupKey,
  invitationKey,
  memberAccessKey,
  sessionKey,
  validateAccessIdentifier,
  validateSecretDigest
} from '../src/club-access/club-access-keys';
import {
  AccessInvitation,
  AccessSession,
  HandleLookup,
  MemberAccessState,
  PinVerifierMetadata,
  validateAccessInvitation,
  validateAccessSession,
  validateHandleLookup,
  validateMemberAccessState,
  validatePinVerifierMetadata
} from '../src/club-access/club-access-model';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const CREATED_AT = '2026-11-10T12:00:00.000Z';
const UPDATED_AT = '2026-11-10T12:05:00.000Z';

const verifier = (): PinVerifierMetadata => ({
  algorithm: 'HMAC-SHA256+SCRYPT',
  kdfVersion: 1,
  saltBase64Url: Buffer.alloc(32, 1).toString('base64url'),
  verifierBase64Url: Buffer.alloc(32, 2).toString('base64url'),
  pepperVersion: 'test-version-1',
  N: 32768,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
  keyLength: 32,
  createdAtISO: CREATED_AT,
  updatedAtISO: UPDATED_AT
});

const memberAccess = (): MemberAccessState => ({
  studioId: 'bella-mujer',
  clientId: 'client-01',
  handleDigest: DIGEST_A,
  accessStatus: 'active',
  credentialVersion: 2,
  invitationGeneration: 3,
  failedPinAttempts: 1,
  nextAllowedAtISO: UPDATED_AT,
  pinVerifier: verifier(),
  createdAtISO: CREATED_AT,
  updatedAtISO: UPDATED_AT
});

describe('Club access keys', () => {
  it('creates isolated client and digest keys', () => {
    expect(memberAccessKey('client-01')).toEqual({
      pk: 'CLIENT#client-01',
      sk: 'MEMBER_ACCESS'
    });
    expect(handleLookupKey(DIGEST_A)).toEqual({ pk: `HANDLE#${DIGEST_A}`, sk: 'HANDLE' });
    expect(invitationKey(DIGEST_A)).toEqual({ pk: `INVITE#${DIGEST_A}`, sk: 'INVITE' });
    expect(sessionKey(DIGEST_A)).toEqual({ pk: `SESSION#${DIGEST_A}`, sk: 'SESSION' });
  });

  it.each([
    '',
    ' client',
    'client ',
    'client#other',
    'client\nother',
    'x'.repeat(129)
  ])('rejects unsafe or oversized identifiers: %j', (value) => {
    expect(() => validateAccessIdentifier('clientId', value)).toThrow();
    expect(() => memberAccessKey(value)).toThrow();
  });

  it.each([
    '',
    'a'.repeat(63),
    'a'.repeat(65),
    'A'.repeat(64),
    'g'.repeat(64),
    `${'a'.repeat(63)}#`
  ])('rejects malformed SHA-256 digests: %j', (value) => {
    expect(() => validateSecretDigest('digest', value)).toThrow();
    expect(() => handleLookupKey(value)).toThrow();
  });
});

describe('Club access domain validation', () => {
  it('accepts complete member, lookup, invitation, and session records', () => {
    const lookup: HandleLookup = {
      handleDigest: DIGEST_A,
      studioId: 'bella-mujer',
      clientId: 'client-01',
      accessStatus: 'active',
      credentialVersion: 2,
      createdAtISO: CREATED_AT,
      updatedAtISO: UPDATED_AT
    };
    const invitation: AccessInvitation = {
      invitationDigest: DIGEST_B,
      studioId: 'bella-mujer',
      clientId: 'client-01',
      handleDigest: DIGEST_A,
      generation: 3,
      createdAtISO: CREATED_AT,
      expiresAtISO: '2026-11-17T12:00:00.000Z',
      expiresAtEpoch: 1794916800,
      consumed: true,
      consumedAtISO: UPDATED_AT
    };
    const session: AccessSession = {
      sessionDigest: DIGEST_B,
      studioId: 'bella-mujer',
      clientId: 'client-01',
      credentialVersion: 2,
      createdAtISO: CREATED_AT,
      expiresAtISO: '2026-11-10T20:00:00.000Z',
      expiresAtEpoch: 1794340800,
      revoked: true,
      revokedAtISO: UPDATED_AT
    };

    expect(validateMemberAccessState(memberAccess())).toEqual(memberAccess());
    expect(validateHandleLookup(lookup)).toBe(lookup);
    expect(validateAccessInvitation(invitation)).toBe(invitation);
    expect(validateAccessSession(session)).toBe(session);
  });

  it.each([
    ['credentialVersion', -1],
    ['invitationGeneration', -1],
    ['failedPinAttempts', -1],
    ['credentialVersion', 1.5]
  ] as const)('rejects invalid member counter %s', (field, value) => {
    expect(() => validateMemberAccessState({ ...memberAccess(), [field]: value })).toThrow();
  });

  it('rejects malformed timestamps and raw secret fields', () => {
    expect(() => validateMemberAccessState({
      ...memberAccess(),
      updatedAtISO: '2026-11-10 12:00:00'
    })).toThrow();
    expect(() => validateMemberAccessState({
      ...memberAccess(),
      pin: 'synthetic-test-pin'
    } as MemberAccessState)).toThrow(/Forbidden/);
    expect(() => validateHandleLookup({
      handleDigest: DIGEST_A,
      studioId: 'bella-mujer',
      clientId: 'client-01',
      accessStatus: 'unknown',
      credentialVersion: 1,
      createdAtISO: CREATED_AT,
      updatedAtISO: UPDATED_AT
    } as unknown as HandleLookup)).toThrow();
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid TTL epoch %s',
    (expiresAtEpoch) => {
      expect(() => validateAccessSession({
        sessionDigest: DIGEST_B,
        studioId: 'bella-mujer',
        clientId: 'client-01',
        credentialVersion: 2,
        createdAtISO: CREATED_AT,
        expiresAtISO: UPDATED_AT,
        expiresAtEpoch,
        revoked: false
      })).toThrow();
    }
  );

  it('requires consumed and revoked state to agree with their timestamps', () => {
    expect(() => validateAccessInvitation({
      invitationDigest: DIGEST_B,
      studioId: 'bella-mujer',
      clientId: 'client-01',
      handleDigest: DIGEST_A,
      generation: 1,
      createdAtISO: CREATED_AT,
      expiresAtISO: UPDATED_AT,
      expiresAtEpoch: 1,
      consumed: false,
      consumedAtISO: UPDATED_AT
    })).toThrow();
    expect(() => validateAccessSession({
      sessionDigest: DIGEST_B,
      studioId: 'bella-mujer',
      clientId: 'client-01',
      credentialVersion: 1,
      createdAtISO: CREATED_AT,
      expiresAtISO: UPDATED_AT,
      expiresAtEpoch: 1,
      revoked: true
    })).toThrow();
  });

  it('rejects malformed verifier metadata', () => {
    expect(() => validatePinVerifierMetadata({ ...verifier(), N: 32767 })).toThrow();
    expect(() => validatePinVerifierMetadata({ ...verifier(), saltBase64Url: 'not+base64' })).toThrow();
    expect(() => validatePinVerifierMetadata({ ...verifier(), verifierBase64Url: 'AQ' })).toThrow();
    expect(() => validatePinVerifierMetadata({ ...verifier(), maxmem: 1024 })).toThrow();
    expect(() => validatePinVerifierMetadata({
      ...verifier(),
      algorithm: 'SCRYPT'
    } as unknown as PinVerifierMetadata)).toThrow();
  });
});
