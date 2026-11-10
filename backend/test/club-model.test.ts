import { describe, expect, it } from 'vitest';
import {
  balanceKey,
  clientAggregatePartitionKey,
  clientProfileKey,
  ledgerKey,
  visitKey
} from '../src/club/club-keys';
import {
  ClubClient,
  ClubVisit,
  LoyaltyBalance,
  LoyaltyLedgerEntry,
  validateClubVisit,
  validateLoyaltyBalance,
  validateLoyaltyLedgerEntry
} from '../src/club/club-model';
import {
  clubClientFromDynamoItem,
  clubClientToDynamoItem,
  clubVisitFromDynamoItem,
  clubVisitToDynamoItem,
  loyaltyBalanceFromDynamoItem,
  loyaltyBalanceToDynamoItem,
  loyaltyLedgerEntryFromDynamoItem,
  loyaltyLedgerEntryToDynamoItem
} from '../src/club/club-persistence';

const now = '2026-11-09T13:00:00.000Z';
const fingerprint = 'a'.repeat(64);

const client: ClubClient = {
  studioId: 'studio-a', clientId: 'client-id', name: 'Ana', phone: '5551234567',
  status: 'active', createdAtISO: now, updatedAtISO: now
};
const balance: LoyaltyBalance = {
  studioId: 'studio-a', clientId: 'client-id', stampCount: 1,
  eligibleSpendCarryMXN: 500, version: 2, updatedAtISO: now
};
const visit: ClubVisit = {
  studioId: 'studio-a', clientId: 'client-id', visitId: 'visit-id', occurredAtISO: now,
  amountMXN: 800, eligibleAmountMXN: 800, serviceIds: ['srv_pestanas_clasicas'],
  source: 'admin', createdByAdminSub: 'admin-sub', requestFingerprint: fingerprint,
  createdAtISO: now
};
const ledger: LoyaltyLedgerEntry = {
  studioId: 'studio-a', clientId: 'client-id', entryId: 'entry-id', type: 'STAMP_EARNED',
  occurredAtISO: now, createdAtISO: now, stampDelta: 1, eligibleSpendDeltaMXN: -300,
  stampCountAfter: 1, eligibleSpendCarryAfterMXN: 500, createdByAdminSub: 'admin-sub',
  visitId: 'visit-id'
};

describe('Club physical keys', () => {
  it('builds deterministic profile and aggregate keys', () => {
    expect(clientProfileKey('studio-a', 'client-id')).toEqual({
      pk: 'STUDIO#studio-a', sk: 'CLIENT#client-id'
    });
    expect(clientAggregatePartitionKey('studio-a', 'client-id')).toBe(
      'STUDIO#studio-a#CLIENT#client-id'
    );
    expect(balanceKey('studio-a', 'client-id').sk).toBe('BALANCE');
    expect(visitKey('studio-a', 'client-id', 'visit-id').sk).toBe('VISIT#visit-id');
    expect(ledgerKey('studio-a', 'client-id', now, 'entry-id').sk).toBe(
      'LEDGER#2026-11-09T13:00:00.000Z#entry-id'
    );
  });

  it.each(['', ' leading', 'trailing ', 'has#separator', 'control\nvalue', 'x'.repeat(129)])(
    'rejects unsafe key segment %j',
    (unsafe) => expect(() => clientProfileKey(unsafe, 'client-id')).toThrow()
  );
});

describe('Club domain validation and Dynamo mapping', () => {
  it('accepts carry above 300 and negative ledger deltas', () => {
    expect(validateLoyaltyBalance(balance)).toBe(balance);
    expect(validateLoyaltyLedgerEntry(ledger)).toBe(ledger);
  });

  it.each([
    { stampCount: -1 }, { stampCount: 1.5 }, { eligibleSpendCarryMXN: -1 },
    { eligibleSpendCarryMXN: 1.5 }, { eligibleSpendCarryMXN: Number.MAX_SAFE_INTEGER + 1 },
    { version: -1 }, { version: 0.5 }
  ])('rejects invalid balance values %j', (change) => {
    expect(() => validateLoyaltyBalance({ ...balance, ...change })).toThrow();
  });

  it('accepts canonical non-UUID service IDs and rejects fractional money', () => {
    expect(validateClubVisit(visit)).toBe(visit);
    expect(() => validateClubVisit({ ...visit, amountMXN: 800.5 })).toThrow();
    expect(() => validateClubVisit({ ...visit, eligibleAmountMXN: 800.5 })).toThrow();
  });

  it('round-trips every entity without exposing physical keys', () => {
    const roundTrips = [
      clubClientFromDynamoItem(clubClientToDynamoItem(client)),
      loyaltyBalanceFromDynamoItem(loyaltyBalanceToDynamoItem(balance)),
      clubVisitFromDynamoItem(clubVisitToDynamoItem(visit)),
      loyaltyLedgerEntryFromDynamoItem(loyaltyLedgerEntryToDynamoItem(ledger))
    ];
    expect(roundTrips).toEqual([client, balance, visit, ledger]);
    for (const result of roundTrips) {
      expect(result).not.toHaveProperty('pk');
      expect(result).not.toHaveProperty('sk');
    }
  });

  it.each([
    ['astral Unicode', '💅'.repeat(1000)],
    ['ASCII', 'a'.repeat(1000)]
  ])('round-trips a reason at the 1000-character boundary using %s', (_label, reason) => {
    const entry = { ...ledger, reason };
    expect(validateLoyaltyLedgerEntry(entry)).toBe(entry);
    expect(loyaltyLedgerEntryFromDynamoItem(loyaltyLedgerEntryToDynamoItem(entry))).toEqual(entry);
  });

  it.each([
    ['astral Unicode', '💅'.repeat(1001)],
    ['ASCII', 'a'.repeat(1001)]
  ])('rejects a reason beyond the 1000-character boundary using %s', (_label, reason) => {
    expect(() => loyaltyLedgerEntryToDynamoItem({ ...ledger, reason })).toThrow(
      'Invalid Club field: reason'
    );
  });

  it('rejects malformed entity types, numbers, and physical keys', () => {
    const item = loyaltyBalanceToDynamoItem(balance);
    expect(() => loyaltyBalanceFromDynamoItem({ ...item, entityType: { S: 'VISIT' } })).toThrow();
    expect(() => loyaltyBalanceFromDynamoItem({ ...item, stampCount: { N: '1.5' } })).toThrow();
    expect(() => loyaltyBalanceFromDynamoItem({ ...item, pk: { S: 'OTHER' } })).toThrow();
  });
});
