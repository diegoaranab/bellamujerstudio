import { validateKeySegment, validatePromotionId } from './club-keys';

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
    Array.from(value).length > maxLength ||
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
  const serviceIds = new Set<string>();
  visit.serviceIds.forEach((serviceId) => {
    requireBoundedString('serviceIds', serviceId, 128);
    validateKeySegment('serviceIds', serviceId);
    if (serviceIds.has(serviceId)) throw new Error('Invalid Club field: serviceIds');
    serviceIds.add(serviceId);
  });
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

export interface ClubPromotion {
  studioId: string;
  promotionId: string;
  title: string;
  description: string;
  status: 'active' | 'inactive';
  startsAtISO: string;
  endsAtISO: string;
  createdAtISO: string;
  updatedAtISO: string;
}

export const validateClubPromotion = (promotion: ClubPromotion): ClubPromotion => {
  validateKeySegment('studioId', promotion.studioId);
  validatePromotionId(promotion.promotionId);
  requireBoundedString('title', promotion.title, 100);
  const description = promotion.description;
  if (typeof description !== 'string' || !description.length || description.trim() !== description ||
      Array.from(description).length > 500 || /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(description)) {
    throw new Error('Invalid Club field: description');
  }
  if (promotion.status !== 'active' && promotion.status !== 'inactive') throw new Error('Invalid Club field: status');
  for (const value of [promotion.startsAtISO, promotion.endsAtISO, promotion.createdAtISO, promotion.updatedAtISO]) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      throw new Error('Invalid Club promotion timestamp');
    }
    requireISO('promotion timestamp', value);
  }
  if (promotion.startsAtISO >= promotion.endsAtISO || promotion.createdAtISO > promotion.updatedAtISO) {
    throw new Error('Invalid Club promotion time range');
  }
  return promotion;
};

export interface PromotionCapacity {
  studioId: string;
  count: number;
  state: 'READY';
  reconciledAtISO: string;
}

export type PromotionAuditOperation = 'CREATE' | 'UPDATE' | 'DELETE';

export interface PromotionAuditEntry {
  studioId: string;
  eventId: string;
  promotionId: string;
  operation: PromotionAuditOperation;
  occurredAtISO: string;
  adminSub: string;
  requestId: string;
  beforePromotion?: ClubPromotion;
  afterPromotion?: ClubPromotion;
}

export interface PromotionCreateIdempotency {
  studioId: string;
  keyHash: string;
  requestFingerprint: string;
  promotionId: string;
  createdAtISO: string;
  creationResult: ClubPromotion;
}

const validateCanonicalPromotionTimestamp = (field: string, value: string): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`Invalid Club field: ${field}`);
  }
  return requireISO(field, value);
};

const requireSha256 = (field: string, value: string): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`Invalid Club field: ${field}`);
  return value;
};

export const validatePromotionCapacity = (capacity: PromotionCapacity): PromotionCapacity => {
  assertExactLogicalFields(capacity, ['studioId', 'count', 'state', 'reconciledAtISO']);
  validateKeySegment('studioId', capacity.studioId);
  requireSafeInteger('count', capacity.count, 0);
  if (capacity.count > 100 || capacity.state !== 'READY') throw new Error('Invalid Club promotion capacity');
  validateCanonicalPromotionTimestamp('reconciledAtISO', capacity.reconciledAtISO);
  return capacity;
};

export const validatePromotionAuditEntry = (entry: PromotionAuditEntry): PromotionAuditEntry => {
  assertExactLogicalFields(entry, ['studioId', 'eventId', 'promotionId', 'operation', 'occurredAtISO', 'adminSub', 'requestId',
    ...(entry.beforePromotion === undefined ? [] : ['beforePromotion']), ...(entry.afterPromotion === undefined ? [] : ['afterPromotion'])]);
  validateKeySegment('studioId', entry.studioId);
  validatePromotionId(entry.promotionId);
  validatePromotionId(entry.eventId);
  if (!['CREATE', 'UPDATE', 'DELETE'].includes(entry.operation)) throw new Error('Invalid Club promotion audit operation');
  validateCanonicalPromotionTimestamp('occurredAtISO', entry.occurredAtISO);
  requireBoundedString('adminSub', entry.adminSub, 256);
  validateKeySegment('requestId', entry.requestId);
  const hasBefore = entry.beforePromotion !== undefined;
  const hasAfter = entry.afterPromotion !== undefined;
  if ((entry.operation === 'CREATE' && (hasBefore || !hasAfter)) ||
      (entry.operation === 'UPDATE' && (!hasBefore || !hasAfter)) ||
      (entry.operation === 'DELETE' && (!hasBefore || hasAfter))) {
    throw new Error('Invalid Club promotion audit snapshots');
  }
  for (const promotion of [entry.beforePromotion, entry.afterPromotion]) {
    if (promotion) {
      assertExactLogicalFields(promotion, ['studioId', 'promotionId', 'title', 'description', 'status', 'startsAtISO', 'endsAtISO', 'createdAtISO', 'updatedAtISO']);
      validateClubPromotion(promotion);
      if (promotion.studioId !== entry.studioId || promotion.promotionId !== entry.promotionId) {
        throw new Error('Invalid Club promotion audit identity');
      }
    }
  }
  return entry;
};

export const validatePromotionCreateIdempotency = (record: PromotionCreateIdempotency): PromotionCreateIdempotency => {
  assertExactLogicalFields(record, ['studioId', 'keyHash', 'requestFingerprint', 'promotionId', 'createdAtISO', 'creationResult']);
  validateKeySegment('studioId', record.studioId);
  requireSha256('keyHash', record.keyHash);
  requireSha256('requestFingerprint', record.requestFingerprint);
  validatePromotionId(record.promotionId);
  validateCanonicalPromotionTimestamp('createdAtISO', record.createdAtISO);
  validateClubPromotion(record.creationResult);
  assertExactLogicalFields(record.creationResult, ['studioId', 'promotionId', 'title', 'description', 'status', 'startsAtISO', 'endsAtISO', 'createdAtISO', 'updatedAtISO']);
  if (record.creationResult.studioId !== record.studioId || record.creationResult.promotionId !== record.promotionId) {
    throw new Error('Invalid Club promotion idempotency identity');
  }
  return record;
};

const assertExactLogicalFields = (value: object, expected: string[]): void => {
  const actual = Object.keys(value).sort();
  const fields = [...expected].sort();
  if (actual.length !== fields.length || actual.some((field, index) => field !== fields[index])) {
    throw new Error('Invalid Club promotion domain attributes');
  }
};
