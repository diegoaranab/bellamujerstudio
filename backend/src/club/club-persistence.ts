import {
  AttributeValue,
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand
} from '@aws-sdk/client-dynamodb';
import {
  balanceKey,
  clientAggregatePartitionKey,
  clientProfileKey,
  ledgerKey,
  visitKey, promotionKey, promotionPartitionKey, validatePromotionId,
  promotionCapacityKey, promotionAuditKey, promotionCreateIdempotencyKey,
} from './club-keys';
import {
  CLUB_CLIENT_STATUSES,
  ClubClient, ClubPromotion, validateClubPromotion,
  PromotionCapacity, PromotionAuditEntry, PromotionCreateIdempotency,
  validatePromotionCapacity, validatePromotionAuditEntry, validatePromotionCreateIdempotency,
  ClubVisit,
  LOYALTY_LEDGER_TYPES,
  LoyaltyBalance,
  LoyaltyLedgerEntry,
  validateClubClient,
  validateClubVisit,
  validateLoyaltyBalance,
  validateLoyaltyLedgerEntry
} from './club-model';

type DynamoItem = Record<string, AttributeValue>;
type EntityType = 'CLIENT' | 'BALANCE' | 'VISIT' | 'LEDGER' | 'PROMOTION';

export type ClubClientContinuationKey = {
  pk: { S: string };
  sk: { S: string };
};

export interface ClubClientListPage {
  items: ClubClient[];
  lastEvaluatedKey?: ClubClientContinuationKey;
}

export type ClubLedgerContinuationKey = ClubClientContinuationKey;

export interface ClubLedgerListPage {
  items: LoyaltyLedgerEntry[];
  lastEvaluatedKey?: ClubLedgerContinuationKey;
}

export const MAX_LEDGER_ENTRIES_PER_VISIT = 8;
const CREATE_CONDITION = 'attribute_not_exists(pk) AND attribute_not_exists(sk)';

const s = (value: string): AttributeValue => ({ S: value });
const n = (value: number): AttributeValue => ({ N: String(value) });

const requiredString = (item: DynamoItem, field: string, maxLength = 1000): string => {
  const value = item[field]?.S;
  if (typeof value !== 'string' || value.length === 0 || Array.from(value).length > maxLength) {
    throw new Error(`Invalid Club persisted field: ${field}`);
  }
  return value;
};

const optionalString = (item: DynamoItem, field: string, maxLength = 1000): string | undefined => {
  if (item[field] === undefined) return undefined;
  return requiredString(item, field, maxLength);
};

const requiredInteger = (item: DynamoItem, field: string): number => {
  const raw = item[field]?.N;
  if (typeof raw !== 'string' || !/^-?(0|[1-9]\d*)$/.test(raw)) {
    throw new Error(`Invalid Club persisted field: ${field}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`Invalid Club persisted field: ${field}`);
  return value;
};

const requiredStringList = (item: DynamoItem, field: string): string[] => {
  const values = item[field]?.L;
  if (!Array.isArray(values)) throw new Error(`Invalid Club persisted field: ${field}`);
  return values.map((value) => {
    if (typeof value.S !== 'string') throw new Error(`Invalid Club persisted field: ${field}`);
    return value.S;
  });
};

const assertEntity = (item: DynamoItem, entityType: EntityType): void => {
  if (requiredString(item, 'entityType') !== entityType) {
    throw new Error('Invalid Club persisted field: entityType');
  }
};

const assertKey = (item: DynamoItem, expected: { pk: string; sk: string }): void => {
  if (requiredString(item, 'pk') !== expected.pk || requiredString(item, 'sk') !== expected.sk) {
    throw new Error('Invalid Club persisted key');
  }
};

export const clubClientToDynamoItem = (client: ClubClient): DynamoItem => {
  validateClubClient(client);
  const key = clientProfileKey(client.studioId, client.clientId);
  return {
    pk: s(key.pk), sk: s(key.sk), entityType: s('CLIENT'),
    studioId: s(client.studioId), clientId: s(client.clientId), name: s(client.name),
    phone: s(client.phone), status: s(client.status), createdAtISO: s(client.createdAtISO),
    updatedAtISO: s(client.updatedAtISO)
  };
};

export const clubClientFromDynamoItem = (item: DynamoItem): ClubClient => {
  assertEntity(item, 'CLIENT');
  const status = requiredString(item, 'status');
  if (!(CLUB_CLIENT_STATUSES as readonly string[]).includes(status)) {
    throw new Error('Invalid Club persisted field: status');
  }
  const client: ClubClient = {
    studioId: requiredString(item, 'studioId'), clientId: requiredString(item, 'clientId'),
    name: requiredString(item, 'name'), phone: requiredString(item, 'phone'),
    status: status as ClubClient['status'], createdAtISO: requiredString(item, 'createdAtISO'),
    updatedAtISO: requiredString(item, 'updatedAtISO')
  };
  validateClubClient(client);
  assertKey(item, clientProfileKey(client.studioId, client.clientId));
  return client;
};

export const loyaltyBalanceToDynamoItem = (balance: LoyaltyBalance): DynamoItem => {
  validateLoyaltyBalance(balance);
  const key = balanceKey(balance.studioId, balance.clientId);
  return {
    pk: s(key.pk), sk: s(key.sk), entityType: s('BALANCE'), studioId: s(balance.studioId),
    clientId: s(balance.clientId), stampCount: n(balance.stampCount),
    eligibleSpendCarryMXN: n(balance.eligibleSpendCarryMXN), version: n(balance.version),
    updatedAtISO: s(balance.updatedAtISO)
  };
};

export const loyaltyBalanceFromDynamoItem = (item: DynamoItem): LoyaltyBalance => {
  assertEntity(item, 'BALANCE');
  const balance: LoyaltyBalance = {
    studioId: requiredString(item, 'studioId'), clientId: requiredString(item, 'clientId'),
    stampCount: requiredInteger(item, 'stampCount'),
    eligibleSpendCarryMXN: requiredInteger(item, 'eligibleSpendCarryMXN'),
    version: requiredInteger(item, 'version'), updatedAtISO: requiredString(item, 'updatedAtISO')
  };
  validateLoyaltyBalance(balance);
  assertKey(item, balanceKey(balance.studioId, balance.clientId));
  return balance;
};

export const clubVisitToDynamoItem = (visit: ClubVisit): DynamoItem => {
  validateClubVisit(visit);
  const key = visitKey(visit.studioId, visit.clientId, visit.visitId);
  return {
    pk: s(key.pk), sk: s(key.sk), entityType: s('VISIT'), studioId: s(visit.studioId),
    clientId: s(visit.clientId), visitId: s(visit.visitId), occurredAtISO: s(visit.occurredAtISO),
    amountMXN: n(visit.amountMXN), eligibleAmountMXN: n(visit.eligibleAmountMXN),
    serviceIds: { L: visit.serviceIds.map(s) }, source: s(visit.source),
    createdByAdminSub: s(visit.createdByAdminSub), requestFingerprint: s(visit.requestFingerprint),
    createdAtISO: s(visit.createdAtISO)
  };
};

export const clubVisitFromDynamoItem = (item: DynamoItem): ClubVisit => {
  assertEntity(item, 'VISIT');
  const source = requiredString(item, 'source');
  if (source !== 'admin') throw new Error('Invalid Club persisted field: source');
  const visit: ClubVisit = {
    studioId: requiredString(item, 'studioId'), clientId: requiredString(item, 'clientId'),
    visitId: requiredString(item, 'visitId'), occurredAtISO: requiredString(item, 'occurredAtISO'),
    amountMXN: requiredInteger(item, 'amountMXN'),
    eligibleAmountMXN: requiredInteger(item, 'eligibleAmountMXN'),
    serviceIds: requiredStringList(item, 'serviceIds'), source,
    createdByAdminSub: requiredString(item, 'createdByAdminSub'),
    requestFingerprint: requiredString(item, 'requestFingerprint'),
    createdAtISO: requiredString(item, 'createdAtISO')
  };
  validateClubVisit(visit);
  assertKey(item, visitKey(visit.studioId, visit.clientId, visit.visitId));
  return visit;
};

export const loyaltyLedgerEntryToDynamoItem = (entry: LoyaltyLedgerEntry): DynamoItem => {
  validateLoyaltyLedgerEntry(entry);
  const key = ledgerKey(entry.studioId, entry.clientId, entry.occurredAtISO, entry.entryId);
  return {
    pk: s(key.pk), sk: s(key.sk), entityType: s('LEDGER'), studioId: s(entry.studioId),
    clientId: s(entry.clientId), entryId: s(entry.entryId), type: s(entry.type),
    occurredAtISO: s(entry.occurredAtISO), createdAtISO: s(entry.createdAtISO),
    stampDelta: n(entry.stampDelta), eligibleSpendDeltaMXN: n(entry.eligibleSpendDeltaMXN),
    stampCountAfter: n(entry.stampCountAfter),
    eligibleSpendCarryAfterMXN: n(entry.eligibleSpendCarryAfterMXN),
    createdByAdminSub: s(entry.createdByAdminSub),
    ...(entry.visitId !== undefined ? { visitId: s(entry.visitId) } : {}),
    ...(entry.reason !== undefined ? { reason: s(entry.reason) } : {})
  };
};

export const loyaltyLedgerEntryFromDynamoItem = (item: DynamoItem): LoyaltyLedgerEntry => {
  assertEntity(item, 'LEDGER');
  const type = requiredString(item, 'type');
  if (!(LOYALTY_LEDGER_TYPES as readonly string[]).includes(type)) {
    throw new Error('Invalid Club persisted field: type');
  }
  const visitId = optionalString(item, 'visitId');
  const reason = optionalString(item, 'reason');
  const entry: LoyaltyLedgerEntry = {
    studioId: requiredString(item, 'studioId'), clientId: requiredString(item, 'clientId'),
    entryId: requiredString(item, 'entryId'), type: type as LoyaltyLedgerEntry['type'],
    occurredAtISO: requiredString(item, 'occurredAtISO'),
    createdAtISO: requiredString(item, 'createdAtISO'),
    stampDelta: requiredInteger(item, 'stampDelta'),
    eligibleSpendDeltaMXN: requiredInteger(item, 'eligibleSpendDeltaMXN'),
    stampCountAfter: requiredInteger(item, 'stampCountAfter'),
    eligibleSpendCarryAfterMXN: requiredInteger(item, 'eligibleSpendCarryAfterMXN'),
    createdByAdminSub: requiredString(item, 'createdByAdminSub'),
    ...(visitId !== undefined ? { visitId } : {}), ...(reason !== undefined ? { reason } : {})
  };
  validateLoyaltyLedgerEntry(entry);
  assertKey(item, ledgerKey(entry.studioId, entry.clientId, entry.occurredAtISO, entry.entryId));
  return entry;
};

const promotionFields = ['pk', 'sk', 'entityType', 'studioId', 'promotionId', 'title', 'description',
  'status', 'startsAtISO', 'endsAtISO', 'createdAtISO', 'updatedAtISO'];

export const clubPromotionToDynamoItem = (promotion: ClubPromotion): DynamoItem => {
  validateClubPromotion(promotion);
  const key = promotionKey(promotion.studioId, promotion.promotionId);
  const values: Record<string, string> = { ...key, entityType: 'PROMOTION' };
  for (const field of promotionFields.slice(3) as (keyof ClubPromotion)[]) values[field] = promotion[field];
  return Object.fromEntries(Object.entries(values).map(([field, value]) => [field, s(value)]));
};

export const clubPromotionFromDynamoItem = (item: DynamoItem): ClubPromotion => {
  if (Object.keys(item).length !== promotionFields.length ||
      promotionFields.some((field) => !item[field] || Object.keys(item[field]).length !== 1 || typeof item[field].S !== 'string')) {
    throw new Error('Invalid Club promotion attributes');
  }
  assertEntity(item, 'PROMOTION');
  const promotion: ClubPromotion = {
    studioId: requiredString(item, 'studioId'), promotionId: requiredString(item, 'promotionId'),
    title: requiredString(item, 'title'), description: requiredString(item, 'description'),
    status: requiredString(item, 'status') as ClubPromotion['status'],
    startsAtISO: requiredString(item, 'startsAtISO'), endsAtISO: requiredString(item, 'endsAtISO'),
    createdAtISO: requiredString(item, 'createdAtISO'), updatedAtISO: requiredString(item, 'updatedAtISO')
  };
  validateClubPromotion(promotion);
  assertKey(item, promotionKey(promotion.studioId, promotion.promotionId));
  return promotion;
};

const assertExactAttributes = (item: DynamoItem, fields: string[], label: string): void => {
  if (Object.keys(item).length !== fields.length || fields.some((field) => !item[field]) ||
      Object.keys(item).some((field) => !fields.includes(field))) throw new Error(`Invalid Club ${label} attributes`);
};

const assertAttributeType = (item: DynamoItem, field: string, type: 'S' | 'N' | 'M'): void => {
  const value = item[field];
  if (!value || Object.keys(value).length !== 1 || !Object.prototype.hasOwnProperty.call(value, type)) {
    throw new Error(`Invalid Club persisted field: ${field}`);
  }
};

const assertTypedAttributes = (item: DynamoItem, types: Record<string, 'S' | 'N' | 'M'>): void => {
  for (const [field, type] of Object.entries(types)) assertAttributeType(item, field, type);
};

const readMapPromotion = (value: AttributeValue | undefined): ClubPromotion => {
  const map = value?.M;
  if (!map) throw new Error('Invalid Club persisted field: promotion snapshot');
  const expected = ['studioId', 'promotionId', 'title', 'description', 'status', 'startsAtISO', 'endsAtISO', 'createdAtISO', 'updatedAtISO'];
  assertExactAttributes(map, expected, 'promotion snapshot');
  assertTypedAttributes(map, Object.fromEntries(expected.map((field) => [field, 'S'])) as Record<string, 'S'>);
  const promotion = Object.fromEntries(expected.map((field) => [field, requiredString(map, field)])) as unknown as ClubPromotion;
  validateClubPromotion(promotion);
  return promotion;
};

const dynamoMapPromotion = (promotion: ClubPromotion): AttributeValue => ({ M: {
  studioId: s(promotion.studioId), promotionId: s(promotion.promotionId), title: s(promotion.title),
  description: s(promotion.description), status: s(promotion.status), startsAtISO: s(promotion.startsAtISO),
  endsAtISO: s(promotion.endsAtISO), createdAtISO: s(promotion.createdAtISO), updatedAtISO: s(promotion.updatedAtISO)
} });

export const promotionCapacityToDynamoItem = (capacity: PromotionCapacity): DynamoItem => {
  validatePromotionCapacity(capacity);
  const key = promotionCapacityKey(capacity.studioId);
  return { pk: s(key.pk), sk: s(key.sk), entityType: s('PROMOTION_CAPACITY'), studioId: s(capacity.studioId),
    count: n(capacity.count), state: s(capacity.state), reconciledAtISO: s(capacity.reconciledAtISO) };
};

export const promotionCapacityFromDynamoItem = (item: DynamoItem): PromotionCapacity => {
  assertExactAttributes(item, ['pk', 'sk', 'entityType', 'studioId', 'count', 'state', 'reconciledAtISO'], 'promotion capacity');
  assertTypedAttributes(item, { pk: 'S', sk: 'S', entityType: 'S', studioId: 'S', count: 'N', state: 'S', reconciledAtISO: 'S' });
  if (requiredString(item, 'entityType') !== 'PROMOTION_CAPACITY') throw new Error('Invalid Club persisted field: entityType');
  const capacity = { studioId: requiredString(item, 'studioId'), count: requiredInteger(item, 'count'),
    state: requiredString(item, 'state') as 'READY', reconciledAtISO: requiredString(item, 'reconciledAtISO') };
  validatePromotionCapacity(capacity);
  assertKey(item, promotionCapacityKey(capacity.studioId));
  return capacity;
};

const AUDIT_FIELDS = ['pk', 'sk', 'entityType', 'studioId', 'eventId', 'promotionId', 'operation', 'occurredAtISO', 'adminSub', 'requestId'];
export const promotionAuditEntryToDynamoItem = (entry: PromotionAuditEntry): DynamoItem => {
  validatePromotionAuditEntry(entry);
  const key = promotionAuditKey(entry.studioId, entry.occurredAtISO, entry.eventId);
  return { pk: s(key.pk), sk: s(key.sk), entityType: s('PROMOTION_AUDIT'), studioId: s(entry.studioId),
    eventId: s(entry.eventId), promotionId: s(entry.promotionId), operation: s(entry.operation),
    occurredAtISO: s(entry.occurredAtISO), adminSub: s(entry.adminSub), requestId: s(entry.requestId),
    ...(entry.beforePromotion ? { beforePromotion: dynamoMapPromotion(entry.beforePromotion) } : {}),
    ...(entry.afterPromotion ? { afterPromotion: dynamoMapPromotion(entry.afterPromotion) } : {}) };
};

export const promotionAuditEntryFromDynamoItem = (item: DynamoItem): PromotionAuditEntry => {
  const hasBefore = item.beforePromotion !== undefined;
  const hasAfter = item.afterPromotion !== undefined;
  assertExactAttributes(item, [...AUDIT_FIELDS, ...(hasBefore ? ['beforePromotion'] : []), ...(hasAfter ? ['afterPromotion'] : [])], 'promotion audit');
  assertTypedAttributes(item, { pk: 'S', sk: 'S', entityType: 'S', studioId: 'S', eventId: 'S', promotionId: 'S', operation: 'S', occurredAtISO: 'S', adminSub: 'S', requestId: 'S',
    ...(hasBefore ? { beforePromotion: 'M' as const } : {}), ...(hasAfter ? { afterPromotion: 'M' as const } : {}) });
  if (requiredString(item, 'entityType') !== 'PROMOTION_AUDIT') throw new Error('Invalid Club persisted field: entityType');
  const operation = requiredString(item, 'operation') as PromotionAuditEntry['operation'];
  const entry: PromotionAuditEntry = { studioId: requiredString(item, 'studioId'), eventId: requiredString(item, 'eventId'),
    promotionId: requiredString(item, 'promotionId'), operation, occurredAtISO: requiredString(item, 'occurredAtISO'),
    adminSub: requiredString(item, 'adminSub'), requestId: requiredString(item, 'requestId'),
    ...(hasBefore ? { beforePromotion: readMapPromotion(item.beforePromotion) } : {}),
    ...(hasAfter ? { afterPromotion: readMapPromotion(item.afterPromotion) } : {}) };
  validatePromotionAuditEntry(entry);
  assertKey(item, promotionAuditKey(entry.studioId, entry.occurredAtISO, entry.eventId));
  return entry;
};

export const promotionCreateIdempotencyToDynamoItem = (record: PromotionCreateIdempotency): DynamoItem => {
  validatePromotionCreateIdempotency(record);
  const key = promotionCreateIdempotencyKey(record.studioId, record.keyHash);
  return { pk: s(key.pk), sk: s(key.sk), entityType: s('PROMOTION_CREATE_IDEMPOTENCY'), studioId: s(record.studioId),
    keyHash: s(record.keyHash), requestFingerprint: s(record.requestFingerprint), promotionId: s(record.promotionId),
    createdAtISO: s(record.createdAtISO), creationResult: dynamoMapPromotion(record.creationResult) };
};

export const promotionCreateIdempotencyFromDynamoItem = (item: DynamoItem): PromotionCreateIdempotency => {
  assertExactAttributes(item, ['pk', 'sk', 'entityType', 'studioId', 'keyHash', 'requestFingerprint', 'promotionId', 'createdAtISO', 'creationResult'], 'promotion idempotency');
  assertTypedAttributes(item, { pk: 'S', sk: 'S', entityType: 'S', studioId: 'S', keyHash: 'S', requestFingerprint: 'S', promotionId: 'S', createdAtISO: 'S', creationResult: 'M' });
  if (requiredString(item, 'entityType') !== 'PROMOTION_CREATE_IDEMPOTENCY') throw new Error('Invalid Club persisted field: entityType');
  const record: PromotionCreateIdempotency = { studioId: requiredString(item, 'studioId'), keyHash: requiredString(item, 'keyHash'),
    requestFingerprint: requiredString(item, 'requestFingerprint'), promotionId: requiredString(item, 'promotionId'),
    createdAtISO: requiredString(item, 'createdAtISO'), creationResult: readMapPromotion(item.creationResult) };
  validatePromotionCreateIdempotency(record);
  assertKey(item, promotionCreateIdempotencyKey(record.studioId, record.keyHash));
  return record;
};

export interface CommitVisitOutcomeInput {
  visit: ClubVisit;
  ledgerEntries: LoyaltyLedgerEntry[];
  expectedBalanceVersion: number;
  nextBalance: LoyaltyBalance;
}

export interface CreatePromotionOutcomeInput {
  promotion: ClubPromotion;
  capacityMutation: { studioId: string };
  idempotency: PromotionCreateIdempotency;
  audit: PromotionAuditEntry;
}

export interface UpdatePromotionOutcomeInput {
  beforePromotion: ClubPromotion;
  afterPromotion: ClubPromotion;
  expectedUpdatedAtISO: string;
  audit: PromotionAuditEntry;
}

export interface DeletePromotionOutcomeInput {
  beforePromotion: ClubPromotion;
  expectedUpdatedAtISO: string;
  capacityMutation: { studioId: string };
  audit: PromotionAuditEntry;
}

export type PromotionCapacityInitializationResult = 'CREATED' | 'ALREADY_EXISTS';

const samePromotion = (left: ClubPromotion, right: ClubPromotion): boolean =>
  ['studioId', 'promotionId', 'title', 'description', 'status', 'startsAtISO', 'endsAtISO', 'createdAtISO', 'updatedAtISO']
    .every((field) => left[field as keyof ClubPromotion] === right[field as keyof ClubPromotion]);

const validateCapacityMutationIdentity = (identity: { studioId: string }): void => {
  if (!identity || Object.keys(identity).length !== 1 || Object.keys(identity)[0] !== 'studioId') {
    throw new Error('Invalid promotion capacity mutation identity');
  }
}

export class DynamoClubPersistence {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {
    if (!tableName) throw new Error('Club table name is required');
  }

  async listPromotions(studioId: string): Promise<ClubPromotion[]> {
    const partition = promotionPartitionKey(studioId);
    const items: ClubPromotion[] = [];
    let cursor: ClubClientContinuationKey | undefined;
    let previousSk = '';
    for (let requests = 0; requests < 101; requests++) {
      const result = await this.client.send(new QueryCommand({
        TableName: this.tableName, ConsistentRead: true,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
        ExpressionAttributeValues: { ':pk': s(partition), ':prefix': s('PROMOTION#') },
        Limit: 101 - items.length,
        ...(cursor ? { ExclusiveStartKey: cursor } : {})
      }));
      const rows = result.Items ?? [];
      if (rows.length > 101 - items.length) throw new Error('Invalid promotion catalog size');
      for (const row of rows) {
        const promotion = clubPromotionFromDynamoItem(row);
        if (promotion.studioId !== studioId) throw new Error('Invalid promotion studio');
        items.push(promotion);
      }
      if (items.length > 100) throw new Error('Promotion catalog capacity exceeded');
      const key = result.LastEvaluatedKey;
      if (!key) return items;
      const pk = key.pk?.S;
      const sk = key.sk?.S;
      if (Object.keys(key).length !== 2 || !key.pk || Object.keys(key.pk).length !== 1 ||
          !key.sk || Object.keys(key.sk).length !== 1 || pk !== partition ||
          typeof sk !== 'string' || !sk.startsWith('PROMOTION#') || sk <= previousSk) {
        throw new Error('Invalid promotion continuation key');
      }
      validatePromotionId(sk.slice('PROMOTION#'.length));
      previousSk = sk;
      cursor = { pk: { S: pk }, sk: { S: sk } };
    }
    throw new Error('Incomplete promotion catalog');
  }

  async getPromotion(studioId: string, promotionId: string): Promise<ClubPromotion | undefined> {
    return this.get(promotionKey(studioId, promotionId), clubPromotionFromDynamoItem);
  }

  async getPromotionCapacity(studioId: string): Promise<PromotionCapacity | undefined> {
    return this.get(promotionCapacityKey(studioId), promotionCapacityFromDynamoItem);
  }

  async initializePromotionCapacityIfAbsent(capacity: PromotionCapacity): Promise<PromotionCapacityInitializationResult> {
    const item = promotionCapacityToDynamoItem(capacity);
    try {
      await this.client.send(new PutItemCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: CREATE_CONDITION
      }));
      return 'CREATED';
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return 'ALREADY_EXISTS';
      throw error;
    }
  }

  async getPromotionCreateIdempotency(studioId: string, keyHash: string): Promise<PromotionCreateIdempotency | undefined> {
    return this.get(promotionCreateIdempotencyKey(studioId, keyHash), promotionCreateIdempotencyFromDynamoItem);
  }

  async createPromotionOutcome(input: CreatePromotionOutcomeInput): Promise<void> {
    const { promotion, capacityMutation, idempotency, audit } = input;
    validateClubPromotion(promotion);
    validateCapacityMutationIdentity(capacityMutation);
    validatePromotionCreateIdempotency(idempotency);
    validatePromotionAuditEntry(audit);
    if (audit.operation !== 'CREATE' || audit.beforePromotion !== undefined || !audit.afterPromotion ||
        !samePromotion(audit.afterPromotion, promotion) || !samePromotion(idempotency.creationResult, promotion) ||
        capacityMutation.studioId !== promotion.studioId || idempotency.studioId !== promotion.studioId ||
        audit.studioId !== promotion.studioId || audit.promotionId !== promotion.promotionId ||
        idempotency.promotionId !== promotion.promotionId) {
      throw new Error('Invalid promotion create transaction records');
    }
    const capacityKey = promotionCapacityKey(promotion.studioId);
    await this.client.send(new TransactWriteItemsCommand({ TransactItems: [
      { Put: { TableName: this.tableName, Item: clubPromotionToDynamoItem(promotion), ConditionExpression: CREATE_CONDITION } },
      { Update: { TableName: this.tableName, Key: { pk: s(capacityKey.pk), sk: s(capacityKey.sk) },
        UpdateExpression: 'SET #count = #count + :one',
        ConditionExpression: '#entityType = :capacityType AND #state = :ready AND #count BETWEEN :minimum AND :maximum',
        ExpressionAttributeNames: { '#count': 'count', '#entityType': 'entityType', '#state': 'state' },
        ExpressionAttributeValues: { ':one': n(1), ':capacityType': s('PROMOTION_CAPACITY'), ':ready': s('READY'), ':minimum': n(0), ':maximum': n(99) } } },
      { Put: { TableName: this.tableName, Item: promotionCreateIdempotencyToDynamoItem(idempotency), ConditionExpression: CREATE_CONDITION } },
      { Put: { TableName: this.tableName, Item: promotionAuditEntryToDynamoItem(audit), ConditionExpression: CREATE_CONDITION } }
    ] }));
  }

  async updatePromotionOutcome(input: UpdatePromotionOutcomeInput): Promise<void> {
    const { beforePromotion, afterPromotion, expectedUpdatedAtISO, audit } = input;
    validateClubPromotion(beforePromotion); validateClubPromotion(afterPromotion); validatePromotionAuditEntry(audit);
    if (typeof expectedUpdatedAtISO !== 'string' || beforePromotion.updatedAtISO !== expectedUpdatedAtISO ||
        afterPromotion.studioId !== beforePromotion.studioId || afterPromotion.promotionId !== beforePromotion.promotionId ||
        afterPromotion.createdAtISO !== beforePromotion.createdAtISO || afterPromotion.updatedAtISO <= expectedUpdatedAtISO ||
        audit.operation !== 'UPDATE' || !audit.beforePromotion || !audit.afterPromotion ||
        !samePromotion(audit.beforePromotion, beforePromotion) || !samePromotion(audit.afterPromotion, afterPromotion) ||
        audit.studioId !== beforePromotion.studioId || audit.promotionId !== beforePromotion.promotionId) {
      throw new Error('Invalid promotion update transaction records');
    }
    const key = promotionKey(beforePromotion.studioId, beforePromotion.promotionId);
    await this.client.send(new TransactWriteItemsCommand({ TransactItems: [
      { Update: { TableName: this.tableName, Key: { pk: s(key.pk), sk: s(key.sk) },
        UpdateExpression: 'SET #title = :title, #description = :description, #status = :status, #startsAt = :startsAt, #endsAt = :endsAt, #updatedAt = :updatedAt',
        ConditionExpression: 'attribute_exists(pk) AND #entityType = :promotionType AND #studioId = :studioId AND #promotionId = :promotionId AND #updatedAt = :expectedUpdatedAt',
        ExpressionAttributeNames: { '#title': 'title', '#description': 'description', '#status': 'status', '#startsAt': 'startsAtISO', '#endsAt': 'endsAtISO', '#updatedAt': 'updatedAtISO', '#entityType': 'entityType', '#studioId': 'studioId', '#promotionId': 'promotionId' },
        ExpressionAttributeValues: { ':title': s(afterPromotion.title), ':description': s(afterPromotion.description), ':status': s(afterPromotion.status), ':startsAt': s(afterPromotion.startsAtISO), ':endsAt': s(afterPromotion.endsAtISO), ':updatedAt': s(afterPromotion.updatedAtISO), ':promotionType': s('PROMOTION'), ':studioId': s(beforePromotion.studioId), ':promotionId': s(beforePromotion.promotionId), ':expectedUpdatedAt': s(expectedUpdatedAtISO) } } },
      { Put: { TableName: this.tableName, Item: promotionAuditEntryToDynamoItem(audit), ConditionExpression: CREATE_CONDITION } }
    ] }));
  }

  async deletePromotionOutcome(input: DeletePromotionOutcomeInput): Promise<void> {
    const { beforePromotion, expectedUpdatedAtISO, capacityMutation, audit } = input;
    validateClubPromotion(beforePromotion); validatePromotionAuditEntry(audit);
    validateCapacityMutationIdentity(capacityMutation);
    if (typeof expectedUpdatedAtISO !== 'string' || beforePromotion.updatedAtISO !== expectedUpdatedAtISO ||
        capacityMutation.studioId !== beforePromotion.studioId || audit.operation !== 'DELETE' ||
        !audit.beforePromotion || audit.afterPromotion !== undefined || !samePromotion(audit.beforePromotion, beforePromotion) ||
        audit.studioId !== beforePromotion.studioId || audit.promotionId !== beforePromotion.promotionId) {
      throw new Error('Invalid promotion delete transaction records');
    }
    const promotion = promotionKey(beforePromotion.studioId, beforePromotion.promotionId);
    const capacity = promotionCapacityKey(beforePromotion.studioId);
    await this.client.send(new TransactWriteItemsCommand({ TransactItems: [
      { Delete: { TableName: this.tableName, Key: { pk: s(promotion.pk), sk: s(promotion.sk) },
        ConditionExpression: 'attribute_exists(pk) AND #entityType = :promotionType AND #studioId = :studioId AND #promotionId = :promotionId AND #updatedAt = :expectedUpdatedAt',
        ExpressionAttributeNames: { '#entityType': 'entityType', '#studioId': 'studioId', '#promotionId': 'promotionId', '#updatedAt': 'updatedAtISO' },
        ExpressionAttributeValues: { ':promotionType': s('PROMOTION'), ':studioId': s(beforePromotion.studioId), ':promotionId': s(beforePromotion.promotionId), ':expectedUpdatedAt': s(expectedUpdatedAtISO) } } },
      { Update: { TableName: this.tableName, Key: { pk: s(capacity.pk), sk: s(capacity.sk) },
        UpdateExpression: 'SET #count = #count - :one',
        ConditionExpression: '#entityType = :capacityType AND #state = :ready AND #count BETWEEN :minimum AND :maximum',
        ExpressionAttributeNames: { '#count': 'count', '#entityType': 'entityType', '#state': 'state' },
        ExpressionAttributeValues: { ':one': n(1), ':capacityType': s('PROMOTION_CAPACITY'), ':ready': s('READY'), ':minimum': n(1), ':maximum': n(100) } } },
      { Put: { TableName: this.tableName, Item: promotionAuditEntryToDynamoItem(audit), ConditionExpression: CREATE_CONDITION } }
    ] }));
  }

  async createClient(client: ClubClient, initialBalance: LoyaltyBalance): Promise<void> {
    validateClubClient(client);
    validateLoyaltyBalance(initialBalance);
    if (
      client.studioId !== initialBalance.studioId || client.clientId !== initialBalance.clientId ||
      initialBalance.stampCount !== 0 || initialBalance.eligibleSpendCarryMXN !== 0 ||
      initialBalance.version !== 0
    ) {
      throw new Error('Invalid initial Club client aggregate');
    }
    await this.client.send(new TransactWriteItemsCommand({ TransactItems: [
      { Put: { TableName: this.tableName, Item: clubClientToDynamoItem(client), ConditionExpression: CREATE_CONDITION } },
      { Put: { TableName: this.tableName, Item: loyaltyBalanceToDynamoItem(initialBalance), ConditionExpression: CREATE_CONDITION } }
    ] }));
  }

  async getClient(studioId: string, clientId: string): Promise<ClubClient | undefined> {
    return this.get(clientProfileKey(studioId, clientId), clubClientFromDynamoItem);
  }

  async listClients(
    studioId: string,
    limit: number,
    exclusiveStartKey?: ClubClientContinuationKey
  ): Promise<ClubClientListPage> {
    const partitionKey = clientProfileKey(studioId, 'placeholder').pk;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Invalid Club client list limit');
    }
    if (exclusiveStartKey && (
      exclusiveStartKey.pk.S !== partitionKey ||
      !exclusiveStartKey.sk.S.startsWith('CLIENT#') ||
      exclusiveStartKey.sk.S.length === 'CLIENT#'.length
    )) {
      throw new Error('Invalid Club client continuation key');
    }

    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :clientPrefix)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: {
        ':pk': s(partitionKey),
        ':clientPrefix': s('CLIENT#')
      },
      Limit: limit,
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {})
    }));

    const items = (result.Items ?? []).map(clubClientFromDynamoItem);
    const lastEvaluatedKey = result.LastEvaluatedKey;
    if (!lastEvaluatedKey) return { items };
    const pk = lastEvaluatedKey.pk?.S;
    const sk = lastEvaluatedKey.sk?.S;
    if (
      Object.keys(lastEvaluatedKey).length !== 2 ||
      typeof pk !== 'string' || pk !== partitionKey ||
      typeof sk !== 'string' || !sk.startsWith('CLIENT#') || sk.length === 'CLIENT#'.length
    ) {
      throw new Error('DynamoDB returned an invalid Club client continuation key');
    }
    return { items, lastEvaluatedKey: { pk: { S: pk }, sk: { S: sk } } };
  }

  async getBalance(studioId: string, clientId: string): Promise<LoyaltyBalance | undefined> {
    return this.get(balanceKey(studioId, clientId), loyaltyBalanceFromDynamoItem);
  }

  async getVisit(studioId: string, clientId: string, visitId: string): Promise<ClubVisit | undefined> {
    return this.get(visitKey(studioId, clientId, visitId), clubVisitFromDynamoItem);
  }

  async getLedgerEntry(
    studioId: string,
    clientId: string,
    occurredAtISO: string,
    entryId: string
  ): Promise<LoyaltyLedgerEntry | undefined> {
    return this.get(
      ledgerKey(studioId, clientId, occurredAtISO, entryId),
      loyaltyLedgerEntryFromDynamoItem
    );
  }

  async listLedgerEntries(
    studioId: string,
    clientId: string,
    limit: number,
    exclusiveStartKey?: ClubLedgerContinuationKey
  ): Promise<ClubLedgerListPage> {
    const partitionKey = clientAggregatePartitionKey(studioId, clientId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Invalid Club ledger list limit');
    }
    if (exclusiveStartKey) {
      const pk = exclusiveStartKey.pk?.S;
      const sk = exclusiveStartKey.sk?.S;
      if (
        Object.keys(exclusiveStartKey).length !== 2 ||
        !exclusiveStartKey.pk || Object.keys(exclusiveStartKey.pk).length !== 1 ||
        !exclusiveStartKey.sk || Object.keys(exclusiveStartKey.sk).length !== 1 ||
        pk !== partitionKey || typeof sk !== 'string' ||
        !sk.startsWith('LEDGER#') || sk.length === 'LEDGER#'.length ||
        Buffer.byteLength(sk, 'utf8') > 1024
      ) throw new Error('Invalid Club ledger continuation key');
    }

    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :ledgerPrefix)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': s(partitionKey), ':ledgerPrefix': s('LEDGER#') },
      Limit: limit,
      ScanIndexForward: false,
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {})
    }));
    const items = (result.Items ?? []).map(loyaltyLedgerEntryFromDynamoItem);
    const lastEvaluatedKey = result.LastEvaluatedKey;
    if (!lastEvaluatedKey) return { items };
    const pk = lastEvaluatedKey.pk?.S;
    const sk = lastEvaluatedKey.sk?.S;
    if (
      Object.keys(lastEvaluatedKey).length !== 2 || pk !== partitionKey ||
      typeof sk !== 'string' || !sk.startsWith('LEDGER#') || sk.length === 'LEDGER#'.length ||
      Buffer.byteLength(sk, 'utf8') > 1024
    ) throw new Error('DynamoDB returned an invalid Club ledger continuation key');
    return { items, lastEvaluatedKey: { pk: { S: partitionKey }, sk: { S: sk } } };
  }

  private async get<T>(
    key: { pk: string; sk: string },
    deserialize: (item: DynamoItem) => T
  ): Promise<T | undefined> {
    const result = await this.client.send(new GetItemCommand({
      TableName: this.tableName,
      Key: { pk: s(key.pk), sk: s(key.sk) },
      ConsistentRead: true
    }));
    return result.Item ? deserialize(result.Item) : undefined;
  }

  async commitVisitOutcome(input: CommitVisitOutcomeInput): Promise<void> {
    const { visit, ledgerEntries, expectedBalanceVersion, nextBalance } = input;
    validateClubVisit(visit);
    validateLoyaltyBalance(nextBalance);
    if (!Number.isSafeInteger(expectedBalanceVersion) || expectedBalanceVersion < 0) {
      throw new Error('Invalid expected balance version');
    }
    if (
      nextBalance.studioId !== visit.studioId || nextBalance.clientId !== visit.clientId ||
      nextBalance.version !== expectedBalanceVersion + 1
    ) {
      throw new Error('Invalid next balance for visit outcome');
    }
    if (ledgerEntries.length === 0 || ledgerEntries.length > MAX_LEDGER_ENTRIES_PER_VISIT) {
      throw new Error('Invalid ledger entry count for visit outcome');
    }
    const entryIds = new Set<string>();
    for (const entry of ledgerEntries) {
      validateLoyaltyLedgerEntry(entry);
      if (
        entry.studioId !== visit.studioId || entry.clientId !== visit.clientId ||
        (entry.visitId !== undefined && entry.visitId !== visit.visitId) ||
        (entry.type !== 'ADMIN_ADJUSTMENT' && entry.visitId !== visit.visitId) ||
        entryIds.has(entry.entryId)
      ) {
        throw new Error('Invalid ledger entry for visit outcome');
      }
      entryIds.add(entry.entryId);
    }
    const finalEntry = ledgerEntries[ledgerEntries.length - 1];
    if (
      finalEntry.stampCountAfter !== nextBalance.stampCount ||
      finalEntry.eligibleSpendCarryAfterMXN !== nextBalance.eligibleSpendCarryMXN
    ) {
      throw new Error('Final ledger state does not match next balance');
    }

    const key = balanceKey(visit.studioId, visit.clientId);
    await this.client.send(new TransactWriteItemsCommand({ TransactItems: [
      { Put: { TableName: this.tableName, Item: clubVisitToDynamoItem(visit), ConditionExpression: CREATE_CONDITION } },
      ...ledgerEntries.map((entry) => ({ Put: {
        TableName: this.tableName,
        Item: loyaltyLedgerEntryToDynamoItem(entry),
        ConditionExpression: CREATE_CONDITION
      } })),
      { Update: {
        TableName: this.tableName,
        Key: { pk: s(key.pk), sk: s(key.sk) },
        UpdateExpression: 'SET #stampCount = :stampCount, #carry = :carry, #version = :nextVersion, #updatedAt = :updatedAt',
        ConditionExpression: '#version = :expectedVersion AND #entityType = :balanceType',
        ExpressionAttributeNames: {
          '#stampCount': 'stampCount', '#carry': 'eligibleSpendCarryMXN', '#version': 'version',
          '#updatedAt': 'updatedAtISO', '#entityType': 'entityType'
        },
        ExpressionAttributeValues: {
          ':stampCount': n(nextBalance.stampCount), ':carry': n(nextBalance.eligibleSpendCarryMXN),
          ':nextVersion': n(nextBalance.version), ':updatedAt': s(nextBalance.updatedAtISO),
          ':expectedVersion': n(expectedBalanceVersion), ':balanceType': s('BALANCE')
        }
      } }
    ] }));
  }
}
