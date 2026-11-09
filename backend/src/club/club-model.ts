import { validateKeySegment } from './club-keys';

export const CLUB_CLIENT_STATUSES = ['active', 'inactive'] as const;
export type ClubClientStatus = typeof CLUB_CLIENT_STATUSES[number];

export const LOYALTY_LEDGER_TYPES = [
  'ELIGIBLE_SPEND_ADDED',
  'STAMP_EARNED',
  'ADMIN_ADJUSTMENT'
] as const;
export type LoyaltyLedgerType = typeof LOYALTY_LEDGER_TYPES[number];

export interface ClubClient {
  studioId: string;
  clientId: string;
  name: string;
  phone: string;
  status: ClubClientStatus;
  createdAtISO: string;
  updatedAtISO: string;
}

export interface LoyaltyBalance {
  studioId: string;
  clientId: string;
  stampCount: number;
  eligibleSpendCarryMXN: number;
  version: number;
  updatedAtISO: string;
}

export interface ClubVisit {
  studioId: string;
  clientId: string;
  visitId: string;
  occurredAtISO: string;
  amountMXN: number;
  eligibleAmountMXN: number;
  serviceIds: string[];
  source: 'admin';
  createdByAdminSub: string;
  requestFingerprint: string;
  createdAtISO: string;
}

export interface LoyaltyLedgerEntry {
  studioId: string;
  clientId: string;
  entryId: string;
  type: LoyaltyLedgerType;
  occurredAtISO: string;
  createdAtISO: string;
  stampDelta: number;
  eligibleSpendDeltaMXN: number;
  stampCountAfter: number;
  eligibleSpendCarryAfterMXN: number;
  createdByAdminSub: string;
  visitId?: string;
  reason?: string;
}

const requireBoundedString = (field: string, value: string, maxLength: number): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f-\u009f]/.test(value)
  ) {
    throw new Error(`Invalid Club field: ${field}`);
  }
  return value;
};

const requireISO = (field: string, value: string): string => {
  requireBoundedString(field, value, 32);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`Invalid Club field: ${field}`);
  }
  return value;
};

const requireSafeInteger = (field: string, value: number, minimum?: number): number => {
  if (!Number.isSafeInteger(value) || (minimum !== undefined && value < minimum)) {
    throw new Error(`Invalid Club field: ${field}`);
  }
  return value;
};

const validateIdentity = (studioId: string, clientId: string): void => {
  validateKeySegment('studioId', studioId);
  validateKeySegment('clientId', clientId);
};

export const validateClubClient = (client: ClubClient): ClubClient => {
  validateIdentity(client.studioId, client.clientId);
  requireBoundedString('name', client.name, 200);
  requireBoundedString('phone', client.phone, 50);
  if (!(CLUB_CLIENT_STATUSES as readonly string[]).includes(client.status)) {
    throw new Error('Invalid Club field: status');
  }
  requireISO('createdAtISO', client.createdAtISO);
  requireISO('updatedAtISO', client.updatedAtISO);
  return client;
};

export const validateLoyaltyBalance = (balance: LoyaltyBalance): LoyaltyBalance => {
  validateIdentity(balance.studioId, balance.clientId);
  requireSafeInteger('stampCount', balance.stampCount, 0);
  requireSafeInteger('eligibleSpendCarryMXN', balance.eligibleSpendCarryMXN, 0);
  requireSafeInteger('version', balance.version, 0);
  requireISO('updatedAtISO', balance.updatedAtISO);
  return balance;
};

export const validateClubVisit = (visit: ClubVisit): ClubVisit => {
  validateIdentity(visit.studioId, visit.clientId);
  validateKeySegment('visitId', visit.visitId);
  requireISO('occurredAtISO', visit.occurredAtISO);
  requireISO('createdAtISO', visit.createdAtISO);
  requireSafeInteger('amountMXN', visit.amountMXN, 0);
  requireSafeInteger('eligibleAmountMXN', visit.eligibleAmountMXN, 0);
  if (visit.eligibleAmountMXN > visit.amountMXN) {
    throw new Error('Invalid Club field: eligibleAmountMXN');
  }
  if (!Array.isArray(visit.serviceIds) || visit.serviceIds.length > 50) {
    throw new Error('Invalid Club field: serviceIds');
  }
  visit.serviceIds.forEach((serviceId) => requireBoundedString('serviceIds', serviceId, 128));
  if (visit.source !== 'admin') throw new Error('Invalid Club field: source');
  requireBoundedString('createdByAdminSub', visit.createdByAdminSub, 256);
  if (!/^[a-f0-9]{64}$/.test(visit.requestFingerprint)) {
    throw new Error('Invalid Club field: requestFingerprint');
  }
  return visit;
};

export const validateLoyaltyLedgerEntry = (
  entry: LoyaltyLedgerEntry
): LoyaltyLedgerEntry => {
  validateIdentity(entry.studioId, entry.clientId);
  validateKeySegment('entryId', entry.entryId);
  if (!(LOYALTY_LEDGER_TYPES as readonly string[]).includes(entry.type)) {
    throw new Error('Invalid Club field: type');
  }
  requireISO('occurredAtISO', entry.occurredAtISO);
  requireISO('createdAtISO', entry.createdAtISO);
  requireSafeInteger('stampDelta', entry.stampDelta);
  requireSafeInteger('eligibleSpendDeltaMXN', entry.eligibleSpendDeltaMXN);
  requireSafeInteger('stampCountAfter', entry.stampCountAfter, 0);
  requireSafeInteger('eligibleSpendCarryAfterMXN', entry.eligibleSpendCarryAfterMXN, 0);
  requireBoundedString('createdByAdminSub', entry.createdByAdminSub, 256);
  if (entry.visitId !== undefined) validateKeySegment('visitId', entry.visitId);
  if (entry.reason !== undefined) requireBoundedString('reason', entry.reason, 1000);
  return entry;
};
