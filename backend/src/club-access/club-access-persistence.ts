import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand
} from '@aws-sdk/client-dynamodb';
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

const CREATE_CONDITION = 'attribute_not_exists(#pk) AND attribute_not_exists(#sk)';
const CREATE_NAMES = { '#pk': 'pk', '#sk': 'sk' };
const INVITATION_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;

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

const validateInvitationAggregate = (
  state: MemberAccessState,
  lookup: HandleLookup,
  invitation: AccessInvitation
): void => {
  validateMemberAccessState(state);
  validateHandleLookup(lookup);
  validateAccessInvitation(invitation);
  const invitationCreatedAt = new Date(invitation.createdAtISO).getTime();
  const invitationExpiresAt = new Date(invitation.expiresAtISO).getTime();
  if (
    state.studioId !== lookup.studioId || state.studioId !== invitation.studioId ||
    state.clientId !== lookup.clientId || state.clientId !== invitation.clientId ||
    state.handleDigest !== lookup.handleDigest || state.handleDigest !== invitation.handleDigest ||
    state.accessStatus !== lookup.accessStatus ||
    state.credentialVersion !== lookup.credentialVersion ||
    state.invitationGeneration !== invitation.generation ||
    state.accessStatus !== 'invited' || state.pinVerifier !== undefined ||
    state.nextAllowedAtISO !== undefined || state.failedPinAttempts !== 0 ||
    invitation.consumed || invitation.consumedAtISO !== undefined ||
    state.updatedAtISO !== invitation.createdAtISO ||
    lookup.createdAtISO !== invitation.createdAtISO ||
    lookup.updatedAtISO !== invitation.createdAtISO ||
    invitationExpiresAt - invitationCreatedAt !== INVITATION_VALIDITY_MS ||
    Math.floor(invitationExpiresAt / 1000) !== invitation.expiresAtEpoch
  ) {
    throw new Error('Invalid Club access invitation aggregate');
  }
};

const validateExpectedTransition = (
  expected: MemberAccessState,
  next: MemberAccessState,
  lookup: HandleLookup,
  invitation: AccessInvitation,
  transition: 'regeneration' | 'reset'
): void => {
  validateMemberAccessState(expected);
  validateInvitationAggregate(next, lookup, invitation);
  const expectedGeneration = expected.invitationGeneration + 1;
  const expectedCredentialVersion = transition === 'reset'
    ? expected.credentialVersion + 1
    : expected.credentialVersion;
  if (
    !Number.isSafeInteger(expectedGeneration) ||
    !Number.isSafeInteger(expectedCredentialVersion) ||
    expected.studioId !== next.studioId || expected.clientId !== next.clientId ||
    expected.handleDigest === next.handleDigest ||
    next.createdAtISO !== expected.createdAtISO ||
    next.invitationGeneration !== expectedGeneration ||
    next.credentialVersion !== expectedCredentialVersion ||
    (transition === 'regeneration' &&
      (expected.accessStatus !== 'invited' || expected.pinVerifier !== undefined ||
        expected.failedPinAttempts !== 0 || expected.nextAllowedAtISO !== undefined)) ||
    (transition === 'reset' &&
      expected.accessStatus !== 'active' && expected.accessStatus !== 'disabled')
  ) {
    throw new Error(`Invalid Club access ${transition} transition`);
  }
};

const expectedStateCondition = (expected: MemberAccessState, requireNoPin: boolean) => ({
  ConditionExpression: [
    '#entityType = :memberType',
    '#studioId = :studioId',
    '#clientId = :clientId',
    '#accessStatus = :accessStatus',
    '#handleDigest = :handleDigest',
    '#credentialVersion = :credentialVersion',
    '#invitationGeneration = :invitationGeneration',
    '#failedPinAttempts = :failedPinAttempts',
    '#createdAtISO = :createdAtISO',
    '#updatedAtISO = :updatedAtISO',
    ...(expected.nextAllowedAtISO === undefined
      ? ['attribute_not_exists(#nextAllowedAtISO)']
      : ['#nextAllowedAtISO = :nextAllowedAtISO']),
    ...(requireNoPin || expected.pinVerifier === undefined
      ? ['attribute_not_exists(#pinAlgorithm)']
      : ['#pinVerifierBase64Url = :pinVerifierBase64Url'])
  ].join(' AND '),
  ExpressionAttributeNames: {
    '#entityType': 'entityType', '#studioId': 'studioId', '#clientId': 'clientId',
    '#accessStatus': 'accessStatus', '#handleDigest': 'handleDigest',
    '#credentialVersion': 'credentialVersion', '#invitationGeneration': 'invitationGeneration',
    '#failedPinAttempts': 'failedPinAttempts', '#createdAtISO': 'createdAtISO',
    '#updatedAtISO': 'updatedAtISO',
    '#nextAllowedAtISO': 'nextAllowedAtISO',
    ...(requireNoPin || expected.pinVerifier === undefined
      ? { '#pinAlgorithm': 'pinAlgorithm' }
      : { '#pinVerifierBase64Url': 'pinVerifierBase64Url' })
  },
  ExpressionAttributeValues: {
    ':memberType': s('MEMBER_ACCESS'), ':studioId': s(expected.studioId),
    ':clientId': s(expected.clientId), ':accessStatus': s(expected.accessStatus),
    ':handleDigest': s(expected.handleDigest),
    ':credentialVersion': n(expected.credentialVersion),
    ':invitationGeneration': n(expected.invitationGeneration),
    ':failedPinAttempts': n(expected.failedPinAttempts),
    ':createdAtISO': s(expected.createdAtISO), ':updatedAtISO': s(expected.updatedAtISO),
    ...(expected.nextAllowedAtISO === undefined
      ? {}
      : { ':nextAllowedAtISO': s(expected.nextAllowedAtISO) }),
    ...(requireNoPin || expected.pinVerifier === undefined
      ? {}
      : { ':pinVerifierBase64Url': s(expected.pinVerifier.verifierBase64Url) })
  }
});

const expectedHandleCondition = (expected: MemberAccessState) => ({
  ConditionExpression: [
    '#entityType = :handleType',
    '#studioId = :studioId',
    '#clientId = :clientId',
    '#accessStatus = :accessStatus',
    '#handleDigest = :handleDigest',
    '#credentialVersion = :credentialVersion'
  ].join(' AND '),
  ExpressionAttributeNames: {
    '#entityType': 'entityType', '#studioId': 'studioId', '#clientId': 'clientId',
    '#accessStatus': 'accessStatus', '#handleDigest': 'handleDigest',
    '#credentialVersion': 'credentialVersion'
  },
  ExpressionAttributeValues: {
    ':handleType': s('HANDLE'), ':studioId': s(expected.studioId),
    ':clientId': s(expected.clientId), ':accessStatus': s(expected.accessStatus),
    ':handleDigest': s(expected.handleDigest),
    ':credentialVersion': n(expected.credentialVersion)
  }
});

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

  async createInitialInvitation(
    state: MemberAccessState,
    lookup: HandleLookup,
    invitation: AccessInvitation
  ): Promise<void> {
    validateInvitationAggregate(state, lookup, invitation);
    if (state.credentialVersion !== 0 || state.invitationGeneration !== 1) {
      throw new Error('Invalid initial Club access invitation');
    }
    await this.client.send(new TransactWriteItemsCommand({ TransactItems: [
      { Put: {
        TableName: this.tableName, Item: memberAccessStateToDynamoItem(state),
        ConditionExpression: CREATE_CONDITION, ExpressionAttributeNames: CREATE_NAMES
      } },
      { Put: {
        TableName: this.tableName, Item: handleLookupToDynamoItem(lookup),
        ConditionExpression: CREATE_CONDITION, ExpressionAttributeNames: CREATE_NAMES
      } },
      { Put: {
        TableName: this.tableName, Item: accessInvitationToDynamoItem(invitation),
        ConditionExpression: CREATE_CONDITION, ExpressionAttributeNames: CREATE_NAMES
      } }
    ] }));
  }

  async rotatePreEnrollmentInvitation(
    expected: MemberAccessState,
    next: MemberAccessState,
    lookup: HandleLookup,
    invitation: AccessInvitation
  ): Promise<void> {
    validateExpectedTransition(expected, next, lookup, invitation, 'regeneration');
    const stateCondition = expectedStateCondition(expected, true);
    const oldHandleKey = handleLookupKey(expected.handleDigest);
    await this.client.send(new TransactWriteItemsCommand({ TransactItems: [
      { Put: {
        TableName: this.tableName, Item: memberAccessStateToDynamoItem(next),
        ...stateCondition
      } },
      { Delete: {
        TableName: this.tableName,
        Key: { pk: s(oldHandleKey.pk), sk: s(oldHandleKey.sk) },
        ...expectedHandleCondition(expected)
      } },
      { Put: {
        TableName: this.tableName, Item: handleLookupToDynamoItem(lookup),
        ConditionExpression: CREATE_CONDITION, ExpressionAttributeNames: CREATE_NAMES
      } },
      { Put: {
        TableName: this.tableName, Item: accessInvitationToDynamoItem(invitation),
        ConditionExpression: CREATE_CONDITION, ExpressionAttributeNames: CREATE_NAMES
      } }
    ] }));
  }

  async fullResetAccess(
    expected: MemberAccessState,
    next: MemberAccessState,
    lookup: HandleLookup,
    invitation: AccessInvitation
  ): Promise<void> {
    validateExpectedTransition(expected, next, lookup, invitation, 'reset');
    const stateCondition = expectedStateCondition(expected, false);
    const oldHandleKey = handleLookupKey(expected.handleDigest);
    await this.client.send(new TransactWriteItemsCommand({ TransactItems: [
      { Put: {
        TableName: this.tableName, Item: memberAccessStateToDynamoItem(next),
        ...stateCondition
      } },
      { Delete: {
        TableName: this.tableName,
        Key: { pk: s(oldHandleKey.pk), sk: s(oldHandleKey.sk) },
        ...expectedHandleCondition(expected)
      } },
      { Put: {
        TableName: this.tableName, Item: handleLookupToDynamoItem(lookup),
        ConditionExpression: CREATE_CONDITION, ExpressionAttributeNames: CREATE_NAMES
      } },
      { Put: {
        TableName: this.tableName, Item: accessInvitationToDynamoItem(invitation),
        ConditionExpression: CREATE_CONDITION, ExpressionAttributeNames: CREATE_NAMES
      } }
    ] }));
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
