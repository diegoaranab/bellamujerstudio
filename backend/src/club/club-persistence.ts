import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand
} from '@aws-sdk/client-dynamodb';
import {
  balanceKey,
  clientProfileKey,
  ledgerKey,
  visitKey
} from './club-keys';
import {
  CLUB_CLIENT_STATUSES,
  ClubClient,
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
type EntityType = 'CLIENT' | 'BALANCE' | 'VISIT' | 'LEDGER';

export const MAX_LEDGER_ENTRIES_PER_VISIT = 8;
const CREATE_CONDITION = 'attribute_not_exists(pk) AND attribute_not_exists(sk)';

const s = (value: string): AttributeValue => ({ S: value });
const n = (value: number): AttributeValue => ({ N: String(value) });

const requiredString = (item: DynamoItem, field: string, maxLength = 1000): string => {
  const value = item[field]?.S;
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
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

export interface CommitVisitOutcomeInput {
  visit: ClubVisit;
  ledgerEntries: LoyaltyLedgerEntry[];
  expectedBalanceVersion: number;
  nextBalance: LoyaltyBalance;
}

export class DynamoClubPersistence {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {
    if (!tableName) throw new Error('Club table name is required');
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

  async getBalance(studioId: string, clientId: string): Promise<LoyaltyBalance | undefined> {
    return this.get(balanceKey(studioId, clientId), loyaltyBalanceFromDynamoItem);
  }

  async getVisit(studioId: string, clientId: string, visitId: string): Promise<ClubVisit | undefined> {
    return this.get(visitKey(studioId, clientId, visitId), clubVisitFromDynamoItem);
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
