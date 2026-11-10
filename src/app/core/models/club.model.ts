export type ClubClientStatus = 'active' | 'inactive';

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
  createdAtISO: string;
}

export type LoyaltyLedgerType =
  | 'ELIGIBLE_SPEND_ADDED'
  | 'STAMP_EARNED'
  | 'ADMIN_ADJUSTMENT';

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
