import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  TransactWriteItemsCommand
} from '@aws-sdk/client-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubClient, ClubVisit, LoyaltyBalance, LoyaltyLedgerEntry } from '../src/club/club-model';
import {
  DynamoClubPersistence,
  MAX_LEDGER_ENTRIES_PER_VISIT,
  clubClientToDynamoItem,
  loyaltyBalanceToDynamoItem
} from '../src/club/club-persistence';

const now = '2026-11-09T13:00:00.000Z';
const client: ClubClient = {
  studioId: 'studio-a', clientId: 'client-id', name: 'Ana', phone: '5551234567',
  status: 'active', createdAtISO: now, updatedAtISO: now
};
const initialBalance: LoyaltyBalance = {
  studioId: 'studio-a', clientId: 'client-id', stampCount: 0,
  eligibleSpendCarryMXN: 0, version: 0, updatedAtISO: now
};
const visit: ClubVisit = {
  studioId: 'studio-a', clientId: 'client-id', visitId: 'visit-id', occurredAtISO: now,
  amountMXN: 800, eligibleAmountMXN: 800, serviceIds: ['srv_pestanas_clasicas'],
  source: 'admin', createdByAdminSub: 'admin-sub', requestFingerprint: 'a'.repeat(64),
  createdAtISO: now
};
const entry = (entryId = 'entry-id'): LoyaltyLedgerEntry => ({
  studioId: 'studio-a', clientId: 'client-id', entryId, type: 'STAMP_EARNED',
  occurredAtISO: now, createdAtISO: now, stampDelta: 1, eligibleSpendDeltaMXN: -300,
  stampCountAfter: 1, eligibleSpendCarryAfterMXN: 500, createdByAdminSub: 'admin-sub',
  visitId: 'visit-id'
});
const nextBalance: LoyaltyBalance = {
  ...initialBalance, stampCount: 1, eligibleSpendCarryMXN: 500, version: 1
};

describe('DynamoClubPersistence', () => {
  const send = vi.fn();
  const persistence = new DynamoClubPersistence({ send } as unknown as DynamoDBClient, 'club-table');

  beforeEach(() => send.mockReset().mockResolvedValue({}));

  it('atomically creates exactly the profile and zero balance in the Club table', async () => {
    await persistence.createClient(client, initialBalance);
    expect(send).toHaveBeenCalledOnce();
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(TransactWriteItemsCommand);
    const items = command.input.TransactItems;
    expect(items).toHaveLength(2);
    expect(items?.map((item: { Put?: { TableName?: string } }) => item.Put?.TableName)).toEqual([
      'club-table', 'club-table'
    ]);
    expect(items?.[0].Put).toMatchObject({
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
      Item: { pk: { S: 'STUDIO#studio-a' }, sk: { S: 'CLIENT#client-id' } }
    });
    expect(items?.[1].Put).toMatchObject({
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
      Item: { pk: { S: 'STUDIO#studio-a#CLIENT#client-id' }, sk: { S: 'BALANCE' } }
    });
    expect(JSON.stringify(command.input)).not.toContain('GiftCards');
  });

  it('rejects mismatched or nonzero initial aggregates before DynamoDB', async () => {
    await expect(persistence.createClient(client, { ...initialBalance, clientId: 'other' }))
      .rejects.toThrow();
    await expect(persistence.createClient(client, { ...initialBalance, stampCount: 1 }))
      .rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('uses direct strongly consistent reads and returns undefined for missing items', async () => {
    send.mockResolvedValue({});
    expect(await persistence.getClient('studio-a', 'client-id')).toBeUndefined();
    expect(await persistence.getBalance('studio-a', 'client-id')).toBeUndefined();
    expect(await persistence.getVisit('studio-a', 'client-id', 'visit-id')).toBeUndefined();
    const commands = send.mock.calls.map((call) => call[0]);
    commands.forEach((command) => {
      expect(command).toBeInstanceOf(GetItemCommand);
      expect(command.input).toMatchObject({ TableName: 'club-table', ConsistentRead: true });
    });
    expect(commands.map((command) => command.input.Key)).toEqual([
      { pk: { S: 'STUDIO#studio-a' }, sk: { S: 'CLIENT#client-id' } },
      { pk: { S: 'STUDIO#studio-a#CLIENT#client-id' }, sk: { S: 'BALANCE' } },
      { pk: { S: 'STUDIO#studio-a#CLIENT#client-id' }, sk: { S: 'VISIT#visit-id' } }
    ]);
  });

  it('lists clients with one bounded Query on the exact studio directory partition', async () => {
    const continuationKey = {
      pk: { S: 'STUDIO#studio-a' },
      sk: { S: 'CLIENT#client-id' }
    };
    send.mockResolvedValue({
      Items: [clubClientToDynamoItem(client)],
      LastEvaluatedKey: continuationKey
    });

    const page = await persistence.listClients('studio-a', 25, continuationKey);
    const command = send.mock.calls[0][0];

    expect(command).toBeInstanceOf(QueryCommand);
    expect(command.input).toEqual({
      TableName: 'club-table',
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :clientPrefix)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: {
        ':pk': { S: 'STUDIO#studio-a' },
        ':clientPrefix': { S: 'CLIENT#' }
      },
      Limit: 25,
      ExclusiveStartKey: continuationKey
    });
    expect(page).toEqual({ items: [client], lastEvaluatedKey: continuationKey });
    expect(JSON.stringify(page.items)).not.toMatch(/"(pk|sk|entityType)"/);
    expect(command.constructor.name).not.toBe('ScanCommand');
  });

  it.each([0, 101, -1, 1.5])('rejects an unsafe client Query limit %s before DynamoDB', async (limit) => {
    await expect(persistence.listClients('studio-a', limit)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects forged input and malformed returned continuation keys', async () => {
    await expect(persistence.listClients('studio-a', 10, {
      pk: { S: 'STUDIO#other' }, sk: { S: 'CLIENT#client-id' }
    })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();

    send.mockResolvedValue({
      Items: [clubClientToDynamoItem(client)],
      LastEvaluatedKey: { pk: { S: 'STUDIO#studio-a#CLIENT#client-id' }, sk: { S: 'BALANCE' } }
    });
    await expect(persistence.listClients('studio-a', 10)).rejects.toThrow();
  });

  it('fails safely for a malformed persisted client', async () => {
    send.mockResolvedValue({
      Items: [{ ...clubClientToDynamoItem(client), phone: { N: '55' } }]
    });
    await expect(persistence.listClients('studio-a', 10)).rejects.toThrow(
      'Invalid Club persisted field: phone'
    );
  });

  it('rejects malformed persisted records', async () => {
    send.mockResolvedValue({ Item: { ...loyaltyBalanceToDynamoItem(initialBalance), version: { N: '-1' } } });
    await expect(persistence.getBalance('studio-a', 'client-id')).rejects.toThrow();
  });

  it('commits immutable visit and ledger records with an optimistic balance update', async () => {
    await persistence.commitVisitOutcome({
      visit, ledgerEntries: [entry()], expectedBalanceVersion: 0, nextBalance
    });
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(TransactWriteItemsCommand);
    const items = command.input.TransactItems;
    expect(items).toHaveLength(3);
    expect(items?.[0].Put).toMatchObject({
      TableName: 'club-table',
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
      Item: { sk: { S: 'VISIT#visit-id' } }
    });
    expect(items?.[1].Put).toMatchObject({
      TableName: 'club-table',
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
      Item: { sk: { S: `LEDGER#${now}#entry-id` } }
    });
    expect(items?.[2].Update).toMatchObject({
      TableName: 'club-table',
      Key: { pk: { S: 'STUDIO#studio-a#CLIENT#client-id' }, sk: { S: 'BALANCE' } },
      ConditionExpression: '#version = :expectedVersion AND #entityType = :balanceType',
      ExpressionAttributeValues: {
        ':expectedVersion': { N: '0' }, ':nextVersion': { N: '1' },
        ':stampCount': { N: '1' }, ':carry': { N: '500' }
      }
    });
  });

  it('rejects invalid transaction aggregates before DynamoDB', async () => {
    const cases = [
      { visit, ledgerEntries: [entry()], expectedBalanceVersion: 0, nextBalance: { ...nextBalance, clientId: 'other' } },
      { visit, ledgerEntries: [{ ...entry(), clientId: 'other' }], expectedBalanceVersion: 0, nextBalance },
      { visit, ledgerEntries: [entry(), entry()], expectedBalanceVersion: 0, nextBalance },
      { visit, ledgerEntries: [], expectedBalanceVersion: 0, nextBalance },
      { visit, ledgerEntries: Array.from({ length: MAX_LEDGER_ENTRIES_PER_VISIT + 1 }, (_, index) => entry(`entry-${index}`)), expectedBalanceVersion: 0, nextBalance },
      { visit, ledgerEntries: [entry()], expectedBalanceVersion: 0, nextBalance: { ...nextBalance, version: 2 } }
    ];
    for (const invalid of cases) await expect(persistence.commitVisitOutcome(invalid)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
