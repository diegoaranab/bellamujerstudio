import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import {
  PIN_KDF_VERSION,
  PIN_VERIFIER_ALGORITHM,
  KDF_V1_SUPPORTED_MAXIMUMS,
  PinVerifierMetadata,
  ScryptParameters,
  validatePinVerifierMetadata,
  validateScryptParameters
} from './club-access-model';

export const OPAQUE_TOKEN_BYTES = 32;
export const PIN_SALT_BYTES = 32;

export const PRODUCTION_SCRYPT_PARAMETERS: Readonly<ScryptParameters> = Object.freeze({
  N: KDF_V1_SUPPORTED_MAXIMUMS.N,
  r: KDF_V1_SUPPORTED_MAXIMUMS.r,
  p: KDF_V1_SUPPORTED_MAXIMUMS.p,
  // The selected N/r working set is about 32 MiB; this explicit ceiling leaves safe headroom.
  maxmem: KDF_V1_SUPPORTED_MAXIMUMS.maxmem,
  keyLength: KDF_V1_SUPPORTED_MAXIMUMS.keyLength
});

export const generateOpaqueToken = (): string => randomBytes(OPAQUE_TOKEN_BYTES).toString('base64url');
export const generateAccessHandle = generateOpaqueToken;
export const generateInvitationToken = generateOpaqueToken;
export const generateSessionToken = generateOpaqueToken;

export const digestSecret = (rawSecret: string): string => {
  if (
    typeof rawSecret !== 'string' ||
    rawSecret.length === 0 ||
    Buffer.byteLength(rawSecret, 'utf8') > 4096
  ) {
    throw new Error('Invalid raw Club access secret');
  }
  return createHash('sha256').update(rawSecret, 'utf8').digest('hex');
};

const DENIED_PINS = new Set(['123456', '654321']);

export const isValidSixDigitPin = (pin: string): boolean =>
  typeof pin === 'string' &&
  /^[0-9]{6}$/.test(pin) &&
  !/^(\d)\1{5}$/.test(pin) &&
  !DENIED_PINS.has(pin);

export interface DerivePinVerifierOptions {
  pepperVersion: string;
  parameters?: ScryptParameters;
  now?: Date;
}

export interface VerifyPinOptions {
  pepperVersion: string;
}

const normalizePepper = (pepper: string | Uint8Array): Buffer => {
  const value = typeof pepper === 'string' ? Buffer.from(pepper, 'utf8') : Buffer.from(pepper);
  if (value.length === 0) throw new Error('PIN pepper must not be empty');
  return value;
};

const deriveWithScrypt = async (
  pin: string,
  pepper: Buffer,
  salt: Buffer,
  parameters: ScryptParameters
): Promise<Buffer> => {
  const prehash = createHmac('sha256', pepper).update(pin, 'utf8').digest();
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(prehash, salt, parameters.keyLength, {
      N: parameters.N,
      r: parameters.r,
      p: parameters.p,
      maxmem: parameters.maxmem
    }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
};

export const derivePinVerifier = async (
  pin: string,
  pepper: string | Uint8Array,
  options: DerivePinVerifierOptions
): Promise<PinVerifierMetadata> => {
  if (!isValidSixDigitPin(pin)) throw new Error('PIN does not satisfy policy');
  const parameters = validateScryptParameters({
    ...(options.parameters ?? PRODUCTION_SCRYPT_PARAMETERS)
  });
  const salt = randomBytes(PIN_SALT_BYTES);
  const createdAtISO = (options.now ?? new Date()).toISOString();
  const derived = await deriveWithScrypt(pin, normalizePepper(pepper), salt, parameters);
  const metadata: PinVerifierMetadata = {
    algorithm: PIN_VERIFIER_ALGORITHM,
    kdfVersion: PIN_KDF_VERSION,
    saltBase64Url: salt.toString('base64url'),
    verifierBase64Url: derived.toString('base64url'),
    pepperVersion: options.pepperVersion,
    ...parameters,
    createdAtISO,
    updatedAtISO: createdAtISO
  };
  return validatePinVerifierMetadata(metadata);
};

export const verifyPin = async (
  pin: string,
  pepper: string | Uint8Array,
  persistedVerifier: PinVerifierMetadata,
  options: VerifyPinOptions
): Promise<boolean> => {
  try {
    if (!isValidSixDigitPin(pin)) return false;
    validatePinVerifierMetadata(persistedVerifier);
    if (persistedVerifier.pepperVersion !== options.pepperVersion) return false;
    const expected = Buffer.from(persistedVerifier.verifierBase64Url, 'base64url');
    const actual = await deriveWithScrypt(
      pin,
      normalizePepper(pepper),
      Buffer.from(persistedVerifier.saltBase64Url, 'base64url'),
      persistedVerifier
    );
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
};
