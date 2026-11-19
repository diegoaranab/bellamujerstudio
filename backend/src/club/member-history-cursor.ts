import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ClubLedgerContinuationKey } from './club-persistence';
import { MemberHistoryCursorSecretProvider } from './member-history-cursor-secret';

const VERSION = 'v1';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const MAX_CIPHERTEXT_LENGTH = 2048;
const MAX_TOKEN_LENGTH = 4096;
const MAX_PLAINTEXT_LENGTH = 2048;
const DERIVATION_PREFIX = 'bella-mujer:member-history-cursor:v1\0';

export interface MemberHistoryCursorCodec {
  encode(key: ClubLedgerContinuationKey, studioId: string, clientId: string): Promise<string>;
  decode(token: string, studioId: string, clientId: string): Promise<ClubLedgerContinuationKey>;
}

const malformedCursor = (): Error => new Error('Invalid member history cursor');

const partition = (studioId: string, clientId: string): string =>
  `STUDIO#${studioId}#CLIENT#${clientId}`;

export const validMemberHistoryContinuationKey = (
  value: unknown,
  studioId: string,
  clientId: string
): value is ClubLedgerContinuationKey => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'pk,sk') return false;
  const pk = record.pk as Record<string, unknown> | undefined;
  const sk = record.sk as Record<string, unknown> | undefined;
  if (!pk || !sk || Object.keys(pk).join(',') !== 'S' || Object.keys(sk).join(',') !== 'S') {
    return false;
  }
  return pk.S === partition(studioId, clientId) && typeof sk.S === 'string' &&
    sk.S.startsWith('LEDGER#') && sk.S.length > 'LEDGER#'.length &&
    Buffer.byteLength(sk.S, 'utf8') <= 1024;
};

const decodeBase64Url = (value: string, expectedLength?: number): Buffer => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw malformedCursor();
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length === 0 || decoded.toString('base64url') !== value ||
      (expectedLength !== undefined && decoded.length !== expectedLength)) {
    throw malformedCursor();
  }
  return decoded;
};

export class EncryptedMemberHistoryCursorCodec implements MemberHistoryCursorCodec {
  private cachedKey?: Promise<Buffer>;

  constructor(
    private readonly secretProvider: MemberHistoryCursorSecretProvider,
    private readonly version = VERSION,
    private readonly random = randomBytes
  ) {
    if (version !== VERSION) throw new Error('Unsupported member history cursor version');
  }

  async encode(
    key: ClubLedgerContinuationKey,
    studioId: string,
    clientId: string
  ): Promise<string> {
    if (!validMemberHistoryContinuationKey(key, studioId, clientId)) throw malformedCursor();
    const iv = this.random(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', await this.derivedKey(), iv);
    cipher.setAAD(Buffer.from(`member-history:${VERSION}:${studioId}:${clientId}`, 'utf8'));
    const plaintext = Buffer.from(JSON.stringify(key), 'utf8');
    if (plaintext.length > MAX_PLAINTEXT_LENGTH) throw malformedCursor();
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join('.');
  }

  async decode(token: string, studioId: string, clientId: string): Promise<ClubLedgerContinuationKey> {
    const key = await this.derivedKey();
    try {
      if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
        throw malformedCursor();
      }
      const parts = token.split('.');
      if (parts.length !== 4 || parts[0] !== VERSION) throw malformedCursor();
      const iv = decodeBase64Url(parts[1], IV_LENGTH);
      const ciphertext = decodeBase64Url(parts[2]);
      const tag = decodeBase64Url(parts[3], TAG_LENGTH);
      if (ciphertext.length > MAX_CIPHERTEXT_LENGTH) throw malformedCursor();
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(`member-history:${VERSION}:${studioId}:${clientId}`, 'utf8'));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      if (plaintext.length === 0 || plaintext.length > MAX_PLAINTEXT_LENGTH) throw malformedCursor();
      const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
      if (!validMemberHistoryContinuationKey(parsed, studioId, clientId)) throw malformedCursor();
      return parsed;
    } catch {
      throw malformedCursor();
    }
  }

  private async derivedKey(): Promise<Buffer> {
    if (!this.cachedKey) {
      this.cachedKey = this.secretProvider.getSecret().then((secret) => {
        if (typeof secret !== 'string' || secret.length === 0) throw new Error('Cursor secret unavailable');
        return createHash('sha256').update(DERIVATION_PREFIX, 'utf8').update(secret, 'utf8').digest();
      }).catch((error) => {
        this.cachedKey = undefined;
        throw error;
      });
    }
    return this.cachedKey;
  }
}
