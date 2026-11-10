import { describe, expect, it } from 'vitest';
import {
  OPAQUE_TOKEN_BYTES,
  PRODUCTION_SCRYPT_PARAMETERS,
  derivePinVerifier,
  digestSecret,
  generateAccessHandle,
  generateInvitationToken,
  generateSessionToken,
  isValidSixDigitPin,
  validateCanonicalOpaqueToken,
  verifyPin
} from '../src/club-access/club-access-crypto';
import { ScryptParameters } from '../src/club-access/club-access-model';

const TEST_SCRYPT_PARAMETERS: ScryptParameters = {
  N: 16,
  r: 1,
  p: 1,
  maxmem: 1024 * 1024,
  keyLength: 32
};

describe('Club access opaque token primitives', () => {
  it.each([generateAccessHandle, generateInvitationToken, generateSessionToken])(
    'generates 32 random bytes encoded as unpadded base64url',
    (generate) => {
      const token = generate();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token).not.toContain('=');
      expect(Buffer.from(token, 'base64url')).toHaveLength(OPAQUE_TOKEN_BYTES);
    }
  );

  it('does not reuse tokens in a small sample', () => {
    const tokens = Array.from({ length: 12 }, generateSessionToken);
    expect(new Set(tokens)).toHaveLength(tokens.length);
  });

  it('accepts only canonical unpadded base64url representing exactly 32 bytes', () => {
    const token = generateSessionToken();
    expect(validateCanonicalOpaqueToken(token)).toBe(token);
    for (const malformed of [
      '', ' ', `${token}=`, token.slice(1), `${token}A`, token.replace(/.$/, '+'),
      Buffer.alloc(31).toString('base64url'), Buffer.alloc(33).toString('base64url')
    ]) expect(() => validateCanonicalOpaqueToken(malformed)).toThrow(/opaque token/);
  });

  it('creates deterministic lowercase 64-character SHA-256 digests', () => {
    const first = digestSecret('synthetic test invitation token');
    const second = digestSecret('synthetic test invitation token');
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(digestSecret('different synthetic test invitation token'));
    expect(digestSecret('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

describe('Club access PIN policy', () => {
  it.each(['12345', '1234567', '12a456', '１２３４５６', '', ' 234567'])(
    'rejects malformed PIN %j',
    (pin) => expect(isValidSixDigitPin(pin)).toBe(false)
  );

  it.each([
    '000000', '111111', '222222', '333333', '444444',
    '555555', '666666', '777777', '888888', '999999',
    '123456', '654321'
  ])('rejects trivial PIN %s', (pin) => expect(isValidSixDigitPin(pin)).toBe(false));

  it.each(['024681', '135790', '260419', '907352'])(
    'accepts nontrivial six-digit PIN %s',
    (pin) => expect(isValidSixDigitPin(pin)).toBe(true)
  );
});

describe('Club access PIN verifier', () => {
  it('locks production parameters to the selected architecture', () => {
    expect(PRODUCTION_SCRYPT_PARAMETERS).toEqual({
      N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024, keyLength: 32
    });
  });

  it('derives and verifies with explicit test-only parameters', async () => {
    const metadata = await derivePinVerifier('907352', 'synthetic-test-pepper', {
      pepperVersion: 'test-v1',
      parameters: TEST_SCRYPT_PARAMETERS,
      now: new Date('2026-11-10T12:00:00.000Z')
    });

    await expect(verifyPin('907352', 'synthetic-test-pepper', metadata, {
      pepperVersion: 'test-v1'
    })).resolves.toBe(true);
    await expect(verifyPin('907351', 'synthetic-test-pepper', metadata, {
      pepperVersion: 'test-v1'
    })).resolves.toBe(false);
    await expect(verifyPin('907352', 'different-synthetic-test-pepper', metadata, {
      pepperVersion: 'test-v1'
    })).resolves.toBe(false);
    await expect(verifyPin('907352', 'synthetic-test-pepper', metadata, {
      pepperVersion: 'test-v2'
    })).resolves.toBe(false);
  });

  it('uses unique salts and verifiers for distinct credentials', async () => {
    const options = { pepperVersion: 'test-v1', parameters: TEST_SCRYPT_PARAMETERS };
    const first = await derivePinVerifier('907352', 'synthetic-test-pepper', options);
    const second = await derivePinVerifier('907352', 'synthetic-test-pepper', options);
    expect(first.saltBase64Url).not.toBe(second.saltBase64Url);
    expect(first.verifierBase64Url).not.toBe(second.verifierBase64Url);
  });

  it('fails closed for malformed persisted verifier metadata', async () => {
    const metadata = await derivePinVerifier('907352', 'synthetic-test-pepper', {
      pepperVersion: 'test-v1',
      parameters: TEST_SCRYPT_PARAMETERS
    });
    await expect(verifyPin('907352', 'synthetic-test-pepper', {
      ...metadata,
      verifierBase64Url: 'malformed+'
    }, { pepperVersion: 'test-v1' })).resolves.toBe(false);
    await expect(verifyPin('907352', 'synthetic-test-pepper', {
      ...metadata,
      maxmem: 1
    }, { pepperVersion: 'test-v1' })).resolves.toBe(false);
  });

  it.each([
    ['N', 32769],
    ['r', 9],
    ['p', 4],
    ['maxmem', 64 * 1024 * 1024 + 1],
    ['keyLength', 31]
  ] as const)('fails closed for oversized persisted %s without deriving', async (field, value) => {
    const metadata = await derivePinVerifier('907352', 'synthetic-test-pepper', {
      pepperVersion: 'test-v1', parameters: TEST_SCRYPT_PARAMETERS
    });
    await expect(verifyPin('907352', 'synthetic-test-pepper', {
      ...metadata, [field]: value
    }, { pepperVersion: 'test-v1' })).resolves.toBe(false);
  });
});
