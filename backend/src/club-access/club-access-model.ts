import { validateAccessIdentifier, validateSecretDigest } from './club-access-keys';

export const MEMBER_ACCESS_STATUSES = ['invited', 'active', 'disabled'] as const;
export type MemberAccessStatus = typeof MEMBER_ACCESS_STATUSES[number];

export const PIN_VERIFIER_ALGORITHM = 'HMAC-SHA256+SCRYPT' as const;
export const PIN_KDF_VERSION = 1 as const;
export const KDF_V1_SUPPORTED_MAXIMUMS: Readonly<Pick<ScryptParameters, 'N' | 'r' | 'p' | 'maxmem' | 'keyLength'>> = Object.freeze({
  N: 32768,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
  keyLength: 32
});

export interface ScryptParameters {
  N: number;
  r: number;
  p: number;
  maxmem: number;
  keyLength: number;
}

export interface PinVerifierMetadata extends ScryptParameters {
  algorithm: typeof PIN_VERIFIER_ALGORITHM;
  kdfVersion: typeof PIN_KDF_VERSION;
  saltBase64Url: string;
  verifierBase64Url: string;
  pepperVersion: string;
  createdAtISO: string;
  updatedAtISO: string;
}

export interface MemberAccessState {
  studioId: string;
  clientId: string;
  handleDigest: string;
  accessStatus: MemberAccessStatus;
  credentialVersion: number;
  invitationGeneration: number;
  failedPinAttempts: number;
  nextAllowedAtISO?: string;
  pinVerifier?: PinVerifierMetadata;
  createdAtISO: string;
  updatedAtISO: string;
}

export interface HandleLookup {
  handleDigest: string;
  studioId: string;
  clientId: string;
  accessStatus: MemberAccessStatus;
  credentialVersion: number;
  createdAtISO: string;
  updatedAtISO: string;
}

export interface AccessInvitation {
  invitationDigest: string;
  studioId: string;
  clientId: string;
  handleDigest: string;
  generation: number;
  createdAtISO: string;
  expiresAtISO: string;
  expiresAtEpoch: number;
  consumed: boolean;
  consumedAtISO?: string;
}

export interface AccessSession {
  sessionDigest: string;
  studioId: string;
  clientId: string;
  credentialVersion: number;
  createdAtISO: string;
  expiresAtISO: string;
  expiresAtEpoch: number;
  revoked: boolean;
  revokedAtISO?: string;
}

const FORBIDDEN_SECRET_FIELDS = new Set([
  'pin',
  'plaintextpin',
  'pepper',
  'rawpepper',
  'accesshandle',
  'rawaccesshandle',
  'invitationtoken',
  'rawinvitationtoken',
  'sessiontoken',
  'rawsessiontoken',
  'prehash',
  'hmacprehash',
  'hmacprehashinput',
  'hmacprehashoutput',
  'rawsecret',
  'rawtoken',
  'name',
  'clientname',
  'phone',
  'phonenumber',
  'email'
]);

export const assertNoRawSecretFields = (value: object): void => {
  for (const field of Object.keys(value)) {
    if (FORBIDDEN_SECRET_FIELDS.has(field.toLowerCase())) {
      throw new Error(`Forbidden Club access secret field: ${field}`);
    }
  }
};

const requireISO = (field: string, value: string): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 32) {
    throw new Error(`Invalid Club access field: ${field}`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`Invalid Club access field: ${field}`);
  }
  return value;
};

const requireSafeInteger = (field: string, value: number, minimum: number): number => {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`Invalid Club access field: ${field}`);
  }
  return value;
};

const requirePositiveSafeInteger = (field: string, value: number): number =>
  requireSafeInteger(field, value, 1);

const validateIdentity = (studioId: string, clientId: string): void => {
  validateAccessIdentifier('studioId', studioId);
  validateAccessIdentifier('clientId', clientId);
};

const validateStatus = (status: MemberAccessStatus): void => {
  if (!(MEMBER_ACCESS_STATUSES as readonly string[]).includes(status)) {
    throw new Error('Invalid Club access field: accessStatus');
  }
};

const decodeCanonicalBase64Url = (field: string, value: string): Buffer => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid Club access field: ${field}`);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length === 0 || decoded.toString('base64url') !== value) {
    throw new Error(`Invalid Club access field: ${field}`);
  }
  return decoded;
};

export const validatePinVerifierMetadata = (
  verifier: PinVerifierMetadata
): PinVerifierMetadata => {
  assertNoRawSecretFields(verifier);
  if (verifier.algorithm !== PIN_VERIFIER_ALGORITHM) {
    throw new Error('Invalid Club access field: algorithm');
  }
  if (verifier.kdfVersion !== PIN_KDF_VERSION) {
    throw new Error('Invalid Club access field: kdfVersion');
  }
  const salt = decodeCanonicalBase64Url('saltBase64Url', verifier.saltBase64Url);
  const derived = decodeCanonicalBase64Url('verifierBase64Url', verifier.verifierBase64Url);
  if (salt.length !== 32) throw new Error('Invalid Club access field: saltBase64Url');
  validateScryptParameters(verifier);
  if (derived.length !== verifier.keyLength) {
    throw new Error('Invalid Club access field: verifierBase64Url');
  }
  validateAccessIdentifier('pepperVersion', verifier.pepperVersion);
  requireISO('createdAtISO', verifier.createdAtISO);
  requireISO('updatedAtISO', verifier.updatedAtISO);
  return verifier;
};

export const validateScryptParameters = <T extends ScryptParameters>(parameters: T): T => {
  requirePositiveSafeInteger('N', parameters.N);
  if (parameters.N > KDF_V1_SUPPORTED_MAXIMUMS.N) {
    throw new Error('Invalid Club access field: N');
  }
  if (!Number.isInteger(Math.log2(parameters.N))) {
    throw new Error('Invalid Club access field: N');
  }
  requirePositiveSafeInteger('r', parameters.r);
  if (parameters.r > KDF_V1_SUPPORTED_MAXIMUMS.r) {
    throw new Error('Invalid Club access field: r');
  }
  requirePositiveSafeInteger('p', parameters.p);
  if (parameters.p > KDF_V1_SUPPORTED_MAXIMUMS.p) {
    throw new Error('Invalid Club access field: p');
  }
  requirePositiveSafeInteger('maxmem', parameters.maxmem);
  if (parameters.maxmem > KDF_V1_SUPPORTED_MAXIMUMS.maxmem) {
    throw new Error('Invalid Club access field: maxmem');
  }
  requirePositiveSafeInteger('keyLength', parameters.keyLength);
  if (parameters.keyLength !== KDF_V1_SUPPORTED_MAXIMUMS.keyLength) {
    throw new Error('Invalid Club access field: keyLength');
  }
  const requiredMemory = 128 * parameters.N * parameters.r;
  if (!Number.isSafeInteger(requiredMemory) || parameters.maxmem <= requiredMemory) {
    throw new Error('Invalid Club access field: maxmem');
  }
  return parameters;
};

export const validateMemberAccessState = (state: MemberAccessState): MemberAccessState => {
  assertNoRawSecretFields(state);
  validateIdentity(state.studioId, state.clientId);
  validateSecretDigest('handleDigest', state.handleDigest);
  validateStatus(state.accessStatus);
  requireSafeInteger('credentialVersion', state.credentialVersion, 0);
  requireSafeInteger('invitationGeneration', state.invitationGeneration, 0);
  requireSafeInteger('failedPinAttempts', state.failedPinAttempts, 0);
  if (state.nextAllowedAtISO !== undefined) requireISO('nextAllowedAtISO', state.nextAllowedAtISO);
  if (state.pinVerifier !== undefined) validatePinVerifierMetadata(state.pinVerifier);
  requireISO('createdAtISO', state.createdAtISO);
  requireISO('updatedAtISO', state.updatedAtISO);
  return state;
};

export const validateHandleLookup = (lookup: HandleLookup): HandleLookup => {
  assertNoRawSecretFields(lookup);
  validateSecretDigest('handleDigest', lookup.handleDigest);
  validateIdentity(lookup.studioId, lookup.clientId);
  validateStatus(lookup.accessStatus);
  requireSafeInteger('credentialVersion', lookup.credentialVersion, 0);
  requireISO('createdAtISO', lookup.createdAtISO);
  requireISO('updatedAtISO', lookup.updatedAtISO);
  return lookup;
};

export const validateAccessInvitation = (
  invitation: AccessInvitation
): AccessInvitation => {
  assertNoRawSecretFields(invitation);
  validateSecretDigest('invitationDigest', invitation.invitationDigest);
  validateIdentity(invitation.studioId, invitation.clientId);
  validateSecretDigest('handleDigest', invitation.handleDigest);
  requireSafeInteger('generation', invitation.generation, 0);
  requireISO('createdAtISO', invitation.createdAtISO);
  requireISO('expiresAtISO', invitation.expiresAtISO);
  requirePositiveSafeInteger('expiresAtEpoch', invitation.expiresAtEpoch);
  if (typeof invitation.consumed !== 'boolean') {
    throw new Error('Invalid Club access field: consumed');
  }
  if (invitation.consumed !== (invitation.consumedAtISO !== undefined)) {
    throw new Error('Invalid Club access field: consumedAtISO');
  }
  if (invitation.consumedAtISO !== undefined) {
    requireISO('consumedAtISO', invitation.consumedAtISO);
  }
  return invitation;
};

export const validateAccessSession = (session: AccessSession): AccessSession => {
  assertNoRawSecretFields(session);
  validateSecretDigest('sessionDigest', session.sessionDigest);
  validateIdentity(session.studioId, session.clientId);
  requireSafeInteger('credentialVersion', session.credentialVersion, 0);
  requireISO('createdAtISO', session.createdAtISO);
  requireISO('expiresAtISO', session.expiresAtISO);
  requirePositiveSafeInteger('expiresAtEpoch', session.expiresAtEpoch);
  if (typeof session.revoked !== 'boolean') {
    throw new Error('Invalid Club access field: revoked');
  }
  if (session.revoked !== (session.revokedAtISO !== undefined)) {
    throw new Error('Invalid Club access field: revokedAtISO');
  }
  if (session.revokedAtISO !== undefined) requireISO('revokedAtISO', session.revokedAtISO);
  return session;
};
