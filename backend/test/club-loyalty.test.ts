import { describe, expect, it } from 'vitest';
import { calculateLoyalty } from '../src/club/club-loyalty';

describe('Club loyalty calculator', () => {
  it.each([
    [0, 250, 0, 250],
    [250, 100, 1, 50],
    [0, 800, 1, 500]
  ])('retains full carry for %s + %s and awards at most one stamp',
    (carry, visit, stampsAwarded, carryAfter) => {
      expect(calculateLoyalty({
        stampCountBefore: 3,
        eligibleSpendCarryBeforeMXN: carry,
        eligibleVisitAmountMXN: visit
      })).toEqual({
        stampsAwarded,
        stampCountAfter: 3 + stampsAwarded,
        eligibleSpendCarryAfterMXN: carryAfter
      });
    });

  it('never awards two or more stamps for one large visit', () => {
    expect(calculateLoyalty({
      stampCountBefore: 0,
      eligibleSpendCarryBeforeMXN: 0,
      eligibleVisitAmountMXN: 10_000
    })).toEqual({ stampsAwarded: 1, stampCountAfter: 1, eligibleSpendCarryAfterMXN: 9_700 });
  });

  it('rejects invalid values and safe-integer overflow', () => {
    for (const input of [
      { stampCountBefore: -1, eligibleSpendCarryBeforeMXN: 0, eligibleVisitAmountMXN: 0 },
      { stampCountBefore: 0, eligibleSpendCarryBeforeMXN: 0.5, eligibleVisitAmountMXN: 0 },
      {
        stampCountBefore: 0,
        eligibleSpendCarryBeforeMXN: Number.MAX_SAFE_INTEGER,
        eligibleVisitAmountMXN: 1
      },
      {
        stampCountBefore: Number.MAX_SAFE_INTEGER,
        eligibleSpendCarryBeforeMXN: 300,
        eligibleVisitAmountMXN: 0
      }
    ]) expect(() => calculateLoyalty(input)).toThrow();
  });
});
