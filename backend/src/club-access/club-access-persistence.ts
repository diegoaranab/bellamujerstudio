import { AttributeValue, DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import {
  handleLookupKey,
  invitationKey,
  memberAccessKey,
  sessionKey,
  validateSecretDigest
} from './club-access-keys';
import {
  AccessInvitation,
  AccessSession,
  HandleLookup,
  MEMBER_ACCESS_STATUSES,
  MemberAccessState,
  PIN_KDF_VERSION,
  PIN_VERIFIER_ALGORITHM,
  PinVerifierMetadata,
  assertNoRawSecretFields,
  validateAccessInvitation,
  validateAccessSession,
  validateHandleLookup,
  validateMemberAccessState
} from './club-access-model';

export type ClubAccessDynamoItem = Record<string, AttributeValue>;
type AccessEntityType = 'MEMBER_ACCESS' | 'HANDLE' | 'INVITE' | 'SESSION';

const s = (value: string): AttributeValue => ({ S: value });
const n = (value: number): AttributeValue => ({ N: String(value) });
const b = (value: boolean): AttributeValue => ({ BOOL: value });

const requiredString = (
  item: ClubAccessDynamoItem,
  field: string,
  maxLength = 1000
): string => {
  const attribute = item[field];
  const value = attribute?.S;
  if (
    attribute === undefined ||
    Object.keys(attribute).length !== 1 ||
    typeof value !== 'string' ||
    value.length === 0 ||
    Array.from(value).length > maxLength
  ) {
    throw new Error(`Invalid Club access persisted field: ${field}`);
  }
  return value;
};

const optionalString = (
  item: ClubAccessDynamoItem,
  field: string,
  maxLength = 1000
): string | undefined =>
  item[field] === undefined ? undefined : requiredString(item, field, maxLength);

const requiredInteger = (item: ClubAccessDynamoItem, field: string): number => {
  const attribute = item[field];
  const raw = attribute?.N;
  if (
    attribute === undefined ||
    Object.keys(attribute).length !== 1 ||
    typeof raw !== 'string' ||
    !/^(0|[1-9]\d*)$/.test(raw)
  ) {
    throw new Error(`Invalid Club access persisted field: ${field}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid Club access persisted field: ${field}`);
  }
  return value;
};

const requiredBoolean = (item: ClubAccessDynamoItem, field: string): boolean => {
  const attribute = item[field];
  if (
    attribute === undefined ||
    Object.keys(attribute).length !== 1 ||
    typeof attribute.BOOL !== 'boolean'
  ) {
    throw new Error(`Invalid Club access persisted field: ${field}`);
  }
  return attribute.BOOL;
};

const assertNoPersistedRawSecrets = (item: ClubAccessDynamoItem): void => {
  assertNoRawSecretFields(item);
};

const assertEntity = (item: ClubAccessDynamoItem, entityType: AccessEntityType): void => {
  assertNoPersistedRawSecrets(item);
  if (requiredString(item, 'entityType') !== entityType) {
    throw new Error('Invalid Club access persisted field: entityType');
  }
};

const assertKey = (
  item: ClubAccessDynamoItem,
  expected: { pk: string; sk: string }
): void => {
  if (requiredString(item, 'pk') !== expected.pk || requiredString(item, 'sk') !== expected.sk) {
    throw new Error('Invalid Club access persisted key');
  }
};

const statusFromItem = (item: ClubAccessDynamoItem): MemberAccessState['accessStatus'] => {
  const value = requiredString(item, 'accessStatus');
  if (!(MEMBER_ACCESS_STATUSES as readonly string[]).includes(value)) {
    throw new Error('Invalid Club access persisted field: accessStatus');
  }
  return value as MemberAccessState['accessStatus'];
};

const pinVerifierToAttributes = (
  verifier: PinVerifierMetadata
): ClubAccessDynamoItem => ({
  pinAlgorithm: s(verifier.algorithm),
  pinKdfVersion: n(verifier.kdfVersion),
  pinSaltBase64Url: s(verifier.saltBase64Url),
  pinVerifierBase64Url: s(verifier.verifierBase64Url),
  pinPepperVersion: s(verifier.pepperVersion),
  pinScryptN: n(verifier.N),
  pinScryptR: n(verifier.r),
  pinScryptP: n(verifier.p),
  pinScryptMaxmem: n(verifier.maxmem),
  pinKeyLength: n(verifier.keyLength),
  pinCreatedAtISO: s(verifier.createdAtISO),
  pinUpdatedAtISO: s(verifier.updatedAtISO)
});

const PIN_ATTRIBUTE_NAMES = [
  'pinAlgorithm',
  'pinKdfVersion',
  'pinSaltBase64Url',
  'pinVerifierBase64Url',
  'pinPepperVersion',
  'pinScryptN',
  'pinScryptR',
  'pinScryptP',
  'pinScryptMaxmem',
  'pinKeyLength',
  'pinCreatedAtISO',
  'pinUpdatedAtISO'
] as const;

const optionalPinVerifierFromItem = (
  item: ClubAccessDynamoItem
): PinVerifierMetadata | undefined => {
  const present = PIN_ATTRIBUTE_NAMES.filter((field) => item[field] !== undefined);
  if (present.length === 0) return undefined;
  if (present.length !== PIN_ATTRIBUTE_NAMES.length) {
    throw new Error('Invalid Club access persisted PIN verifier metadata');
  }
  return {
    algorithm: requiredString(item, 'pinAlgorithm') as typeof PIN_VERIFIER_ALGORITHM,
    kdfVersion: requiredInteger(item, 'pinKdfVersion') as typeof PIN_KDF_VERSION,
    saltBase64Url: requiredString(item, 'pinSaltBase64Url'),
    verifierBase64Url: requiredString(item, 'pinVerifierBase64Url'),
    pepperVersion: requiredString(item, 'pinPepperVersion'),
    N: requiredInteger(item, 'pinScryptN'),
    r: requiredInteger(item, 'pinScryptR'),
    p: requiredInteger(item, 'pinScryptP'),
    maxmem: requiredInteger(item, 'pinScryptMaxmem'),
    keyLength: requiredInteger(item, 'pinKeyLength'),
    createdAtISO: requiredString(item, 'pinCreatedAtISO'),
    updatedAtISO: requiredString(item, 'pinUpdatedAtISO')
  };
};

export const memberAccessStateToDynamoItem = (
  state: MemberAccessState
): ClubAccessDynamoItem => {
  validateMemberAccessState(state);
  const key = memberAccessKey(state.clientId);
  return {
    pk: s(key.pk),
    sk: s(key.sk),
    entityType: s('MEMBER_ACCESS'),
    studioId: s(state.studioId),
    clientId: s(state.clientId),
    handleDigest: s(state.handleDigest),
    accessStatus: s(state.accessStatus),
    credentialVersion: n(state.credentialVersion),
    invitationGeneration: n(state.invitationGeneration),
    failedPinAttempts: n(state.failedPinAttempts),
    ...(state.nextAllowedAtISO ? { nextAllowedAtISO: s(state.nextAllowedAtISO) } : {}),
    ...(state.pinVerifier ? pinVerifierToAttributes(state.pinVerifier) : {}),
    createdAtISO: s(state.createdAtISO),
    updatedAtISO: s(state.updatedAtISO)
  };
};

export const memberAccessStateFromDynamoItem = (
  item: ClubAccessDynamoItem
): MemberAccessState => {
  assertEntity(item, 'MEMBER_ACCESS');
  const state: MemberAccessState = {
    studioId: requiredString(item, 'studioId'),
    clientId: requiredString(item, 'clientId'),
    handleDigest: requiredString(item, 'handleDigest'),
    accessStatus: statusFromItem(item),
    credentialVersion: requiredInteger(item, 'credentialVersion'),
    invitationGeneration: requiredInteger(item, 'invitationGeneration'),
    failedPinAttempts: requiredInteger(item, 'failedPinAttempts'),
    nextAllowedAtISO: optionalString(item, 'nextAllowedAtISO'),
    pinVerifier: optionalPinVerifierFromItem(item),
    createdAtISO: requiredString(item, 'createdAtISO'),
    updatedAtISO: requiredString(item, 'updatedAtISO')
  };
  validateMemberAccessState(state);
  assertKey(item, memberAccessKey(state.clientId));
  return state;
};

export const handleLookupToDynamoItem = (lookup: HandleLookup): ClubAccessDynamoItem => {
  validateHandleLookup(lookup);
  const key = handleLookupKey(lookup.handleDigest);
  return {
    pk: s(key.pk), sk: s(key.sk), entityType: s('HANDLE'),
    handleDigest: s(lookup.handleDigest), studioId: s(lookup.studioId),
    clientId: s(lookup.clientId), accessStatus: s(lookup.accessStatus),
    credentialVersion: n(lookup.credentialVersion), createdAtISO: s(lookup.createdAtISO),
    updatedAtISO: s(lookup.updatedAtISO)
  };
};

export const handleLookupFromDynamoItem = (item: ClubAccessDynamoItem): HandleLookup => {
  assertEntity(item, 'HANDLE');
  const lookup: HandleLookup = {
    handleDigest: requiredString(item, 'handleDigest'), studioId: requiredString(item, 'studioId'),
    clientId: requiredString(item, 'clientId'), accessStatus: statusFromItem(item),
    credentialVersion: requiredInteger(item, 'credentialVersion'),
    createdAtISO: requiredString(item, 'createdAtISO'),
    updatedAtISO: requiredString(item, 'updatedAtISO')
  };
  validateHandleLookup(lookup);
  assertKey(item, handleLookupKey(lookup.handleDigest));
  return lookup;
};

export const accessInvitationToDynamoItem = (
  invitation: AccessInvitation
): ClubAccessDynamoItem => {
  validateAccessInvitation(invitation);
  const key = invitationKey(invitation.invitationDigest);
  return {
    pk: s(key.pk), sk: s(key.sk), entityType: s('INVITE'),
    invitationDigest: s(invitation.invitationDigest), studioId: s(invitation.studioId),
    clientId: s(invitation.clientId), handleDigest: s(invitation.handleDigest),
    generation: n(invitation.generation), createdAtISO: s(invitation.createdAtISO),
    expiresAtISO: s(invitation.expiresAtISO), expiresAtEpoch: n(invitation.expiresAtEpoch),
    consumed: b(invitation.consumed),
    ...(invitation.consumedAtISO ? { consumedAtISO: s(invitation.consumedAtISO) } : {})
  };
};

export const accessInvitationFromDynamoItem = (
  item: ClubAccessDynamoItem
): AccessInvitation => {
  assertEntity(item, 'INVITE');
  const invitation: AccessInvitation = {
    invitationDigest: requiredString(item, 'invitationDigest'),
    studioId: requiredString(item, 'studioId'), clientId: requiredString(item, 'clientId'),
    handleDigest: requiredString(item, 'handleDigest'), generation: requiredInteger(item, 'generation'),
    createdAtISO: requiredString(item, 'createdAtISO'),
    expiresAtISO: requiredString(item, 'expiresAtISO'),
    expiresAtEpoch: requiredInteger(item, 'expiresAtEpoch'),
    consumed: requiredBoolean(item, 'consumed'), consumedAtISO: optionalString(item, 'consumedAtISO')
  };
  validateAccessInvitation(invitation);
  assertKey(item, invitationKey(invitation.invitationDigest));
  return invitation;
};

export const accessSessionToDynamoItem = (session: AccessSession): ClubAccessDynamoItem => {
  validateAccessSession(session);
  const key = sessionKey(session.sessionDigest);
  return {
    pk: s(key.pk), sk: s(key.sk), entityType: s('SESSION'),
    sessionDigest: s(session.sessionDigest), studioId: s(session.studioId),
    clientId: s(session.clientId), credentialVersion: n(session.credentialVersion),
    createdAtISO: s(session.createdAtISO), expiresAtISO: s(session.expiresAtISO),
    expiresAtEpoch: n(session.expiresAtEpoch), revoked: b(session.revoked),
    ...(session.revokedAtISO ? { revokedAtISO: s(session.revokedAtISO) } : {})
  };
};

export const accessSessionFromDynamoItem = (item: ClubAccessDynamoItem): AccessSession => {
  assertEntity(item, 'SESSION');
  const session: AccessSession = {
    sessionDigest: requiredString(item, 'sessionDigest'), studioId: requiredString(item, 'studioId'),
    clientId: requiredString(item, 'clientId'),
    credentialVersion: requiredInteger(item, 'credentialVersion'),
    createdAtISO: requiredString(item, 'createdAtISO'),
    expiresAtISO: requiredString(item, 'expiresAtISO'),
    expiresAtEpoch: requiredInteger(item, 'expiresAtEpoch'),
    revoked: requiredBoolean(item, 'revoked'), revokedAtISO: optionalString(item, 'revokedAtISO')
  };
  validateAccessSession(session);
  assertKey(item, sessionKey(session.sessionDigest));
  return session;
};

export class DynamoClubAccessPersistence {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {
    if (typeof tableName !== 'string' || tableName.trim().length === 0) {
      throw new Error('Club access table name is required');
    }
  }

  getMemberAccess(clientId: string): Promise<MemberAccessState | undefined> {
    return this.#get(memberAccessKey(clientId), memberAccessStateFromDynamoItem);
  }

  getHandleLookup(handleDigest: string): Promise<HandleLookup | undefined> {
    return this.#get(handleLookupKey(validateSecretDigest('handleDigest', handleDigest)), handleLookupFromDynamoItem);
  }

  getInvitation(invitationDigest: string): Promise<AccessInvitation | undefined> {
    return this.#get(
      invitationKey(validateSecretDigest('invitationDigest', invitationDigest)),
      accessInvitationFromDynamoItem
    );
  }

  getSession(sessionDigest: string): Promise<AccessSession | undefined> {
    return this.#get(
      sessionKey(validateSecretDigest('sessionDigest', sessionDigest)),
      accessSessionFromDynamoItem
    );
  }

  async #get<T>(
    key: { pk: string; sk: string },
    deserialize: (item: ClubAccessDynamoItem) => T
  ): Promise<T | undefined> {
    const result = await this.client.send(new GetItemCommand({
      TableName: this.tableName,
      Key: { pk: s(key.pk), sk: s(key.sk) },
      ConsistentRead: true
    }));
    return result.Item ? deserialize(result.Item) : undefined;
  }
}
