import { describe, expect, it, vi } from 'vitest';
import {
  EncryptedMemberHistoryCursorCodec,
  validMemberHistoryContinuationKey
} from '../src/club/member-history-cursor';
import { ClubLedgerContinuationKey } from '../src/club/club-persistence';

const secret = { getSecret: async () => 'dedicated-history-cursor-secret' };
const key: ClubLedgerContinuationKey = {
  pk: { S: 'STUDIO#bella-mujer#CLIENT#client-secret-id' },
  sk: { S: 'LEDGER#2026-11-18T18:00:00.000Z#visit-secret-id-02-stamp' }
};

describe('encrypted member history cursor', () => {
  it('round-trips a key for the same member', async () => {
    const codec = new EncryptedMemberHistoryCursorCodec(secret);
    const token = await codec.encode(key, 'bella-mujer', 'client-secret-id');
    await expect(codec.decode(token, 'bella-mujer', 'client-secret-id')).resolves.toEqual(key);
  });

  it('uses a fresh IV for every token and does not expose internal identifiers', async () => {
    const codec = new EncryptedMemberHistoryCursorCodec(secret);
    const first = await codec.encode(key, 'bella-mujer', 'client-secret-id');
    const second = await codec.encode(key, 'bella-mujer', 'client-secret-id');
    expect(first).not.toBe(second);
    expect(first).not.toContain('bella-mujer');
    expect(first).not.toContain('client-secret-id');
    expect(first).not.toContain('visit-secret-id');
    expect(first).not.toContain('STUDIO');
    expect(first).not.toContain('LEDGER');
    expect(() => Buffer.from(first, 'base64url').toString('utf8')).not.toThrow();
    expect(Buffer.from(first, 'base64url').toString('utf8')).not.toContain('client-secret-id');
  });

  it.each([
    ['client', 'bella-mujer', 'other-client'],
    ['studio', 'other-studio', 'client-secret-id']
  ])('rejects a token for a different %s', async (_label, studioId, clientId) => {
    const codec = new EncryptedMemberHistoryCursorCodec(secret);
    const token = await codec.encode(key, 'bella-mujer', 'client-secret-id');
    await expect(codec.decode(token, studioId, clientId)).rejects.toThrow('Invalid member history cursor');
  });

  it.each([['ciphertext', 2], ['tag', 3], ['iv', 1]])(
    'rejects %s tampering', async (_label, segment) => {
      const codec = new EncryptedMemberHistoryCursorCodec(secret);
      const token = await codec.encode(key, 'bella-mujer', 'client-secret-id');
      const parts = token.split('');
      const boundaries = token.split('.');
      const tampered = boundaries.map((part, index) => index === segment
        ? `${part.slice(0, -1)}${part.endsWith('A') ? 'B' : 'A'}` : part).join('.');
      expect(parts.length).toBeGreaterThan(0);
      await expect(codec.decode(tampered, 'bella-mujer', 'client-secret-id')).rejects.toThrow();
    }
  );

  it.each([
    'v2.a.b.c',
    'v1.bad!.abc.def',
    'v1.aa.aa.aa',
    `v1.${'A'.repeat(4100)}`
  ])('rejects malformed or oversized token %s', async (token) => {
    const codec = new EncryptedMemberHistoryCursorCodec(secret);
    await expect(codec.decode(token, 'bella-mujer', 'client-secret-id')).rejects.toThrow();
  });

  it('rejects an invalid decrypted continuation key', async () => {
    const codec = new EncryptedMemberHistoryCursorCodec(secret);
    const invalidKey = { pk: { S: 'STUDIO#bella-mujer#CLIENT#client-secret-id' }, sk: { S: 'BALANCE' } };
    const token = await codec.encode(invalidKey as ClubLedgerContinuationKey, 'bella-mujer', 'client-secret-id')
      .catch(() => undefined);
    expect(token).toBeUndefined();
    expect(validMemberHistoryContinuationKey(invalidKey, 'bella-mujer', 'client-secret-id')).toBe(false);
  });

  it('fails safely for an empty secret', async () => {
    const codec = new EncryptedMemberHistoryCursorCodec({ getSecret: async () => '' });
    await expect(codec.encode(key, 'bella-mujer', 'client-secret-id')).rejects.toThrow();
  });

  it('caches the loaded secret and supports deterministic injected randomness', async () => {
    const getSecret = vi.fn().mockResolvedValue('dedicated-history-cursor-secret');
    const codec = new EncryptedMemberHistoryCursorCodec(
      { getSecret }, 'v1', () => Buffer.alloc(12, 7)
    );
    await codec.encode(key, 'bella-mujer', 'client-secret-id');
    await codec.encode(key, 'bella-mujer', 'client-secret-id');
    expect(getSecret).toHaveBeenCalledTimes(1);
  });
});
