export const STAMP_THRESHOLD_MXN = 300;

export interface CalculateLoyaltyInput {
  stampCountBefore: number;
  eligibleSpendCarryBeforeMXN: number;
  eligibleVisitAmountMXN: number;
}

export interface LoyaltyCalculation {
  stampsAwarded: 0 | 1;
  stampCountAfter: number;
  eligibleSpendCarryAfterMXN: number;
}

const nonnegativeSafeInteger = (name: string, value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid loyalty value: ${name}`);
  }
};

export const calculateLoyalty = ({
  stampCountBefore,
  eligibleSpendCarryBeforeMXN,
  eligibleVisitAmountMXN
}: CalculateLoyaltyInput): LoyaltyCalculation => {
  nonnegativeSafeInteger('stampCountBefore', stampCountBefore);
  nonnegativeSafeInteger('eligibleSpendCarryBeforeMXN', eligibleSpendCarryBeforeMXN);
  nonnegativeSafeInteger('eligibleVisitAmountMXN', eligibleVisitAmountMXN);
  const total = eligibleSpendCarryBeforeMXN + eligibleVisitAmountMXN;
  if (!Number.isSafeInteger(total)) throw new Error('Loyalty eligible spend overflow');
  const stampsAwarded: 0 | 1 = total >= STAMP_THRESHOLD_MXN ? 1 : 0;
  const stampCountAfter = stampCountBefore + stampsAwarded;
  if (!Number.isSafeInteger(stampCountAfter)) throw new Error('Loyalty stamp count overflow');
  return {
    stampsAwarded,
    stampCountAfter,
    eligibleSpendCarryAfterMXN: total - (stampsAwarded * STAMP_THRESHOLD_MXN)
  };
};
