import { describe, expect, it, vi } from 'vitest';
import { ClubPromotion, PromotionCapacity } from '../src/club/club-model';
import { reconcilePromotionCapacity, PromotionCapacityReconciliationDependencies } from '../src/club/promotion-capacity-reconciliation';

const timestamp = '2026-11-21T12:34:56.789Z';
const promotion = (id: number): ClubPromotion => ({
  studioId: 'studio-a', promotionId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  title: `Oferta ${id}`, description: 'Texto', status: 'inactive',
  startsAtISO: '2026-01-01T00:00:00.000Z', endsAtISO: '2027-01-01T00:00:00.000Z',
  createdAtISO: '2026-01-01T00:00:00.000Z', updatedAtISO: '2026-01-01T00:00:00.000Z'
});
const capacity = (count: number, reconciledAtISO = timestamp, overrides: Partial<PromotionCapacity> = {}): PromotionCapacity => ({
  studioId: 'studio-a', count, state: 'READY', reconciledAtISO, ...overrides
});
const defaultDependencies = (overrides: Partial<PromotionCapacityReconciliationDependencies> = {}): PromotionCapacityReconciliationDependencies => ({
  listPromotions: vi.fn().mockResolvedValue([]),
  getPromotionCapacity: vi.fn().mockResolvedValue(undefined),
  initializePromotionCapacityIfAbsent: vi.fn().mockResolvedValue('CREATED'),
  now: vi.fn(() => new Date(timestamp)),
  ...overrides
});

describe('promotion capacity reconciliation', () => {
  it.each([0, 4])('initializes a missing capacity from the complete catalog count (%i promotions)', async (count) => {
    const promotions = Array.from({ length: count }, (_, index) => promotion(index + 1));
    const getPromotionCapacity = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(capacity(count));
    const initializePromotionCapacityIfAbsent = vi.fn().mockResolvedValue('CREATED');
    const dependencies = defaultDependencies({
      listPromotions: vi.fn().mockResolvedValue(promotions), getPromotionCapacity,
      initializePromotionCapacityIfAbsent
    });

    expect(await reconcilePromotionCapacity('studio-a', dependencies)).toEqual({ status: 'INITIALIZED', capacity: capacity(count) });
    expect(dependencies.listPromotions).toHaveBeenCalledOnce();
    expect(dependencies.listPromotions).toHaveBeenCalledWith('studio-a');
    expect(initializePromotionCapacityIfAbsent).toHaveBeenCalledOnce();
    expect(initializePromotionCapacityIfAbsent).toHaveBeenCalledWith(capacity(count));
    expect(getPromotionCapacity).toHaveBeenCalledTimes(2);
    expect(dependencies.now).toHaveBeenCalledOnce();
  });

  it('verifies an existing matching capacity without changing its reconciliation timestamp', async () => {
    const original = capacity(2, '2026-11-20T01:02:03.004Z');
    const dependencies = defaultDependencies({
      listPromotions: vi.fn().mockResolvedValue([promotion(1), promotion(2)]),
      getPromotionCapacity: vi.fn().mockResolvedValue(original)
    });
    expect(await reconcilePromotionCapacity('studio-a', dependencies)).toEqual({ status: 'VERIFIED', capacity: original });
    expect(dependencies.initializePromotionCapacityIfAbsent).not.toHaveBeenCalled();
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(original.reconciledAtISO).toBe('2026-11-20T01:02:03.004Z');
  });

  it.each([1, 3])('fails closed for existing capacity mismatch (%i)', async (capacityCount) => {
    const dependencies = defaultDependencies({
      listPromotions: vi.fn().mockResolvedValue([promotion(1), promotion(2)]),
      getPromotionCapacity: vi.fn().mockResolvedValue(capacity(capacityCount))
    });
    await expect(reconcilePromotionCapacity('studio-a', dependencies)).rejects.toThrow(/mismatch/);
    expect(dependencies.initializePromotionCapacityIfAbsent).not.toHaveBeenCalled();
  });

  it('fails closed when a read returns malformed capacity', async () => {
    const dependencies = defaultDependencies({
      listPromotions: vi.fn().mockResolvedValue([]),
      getPromotionCapacity: vi.fn().mockResolvedValue(capacity(-1))
    });
    await expect(reconcilePromotionCapacity('studio-a', dependencies)).rejects.toThrow();
    expect(dependencies.initializePromotionCapacityIfAbsent).not.toHaveBeenCalled();
  });

  it('requires an exact strong reread after a successful conditional create', async () => {
    const good = capacity(1);
    const getPromotionCapacity = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(good);
    const dependencies = defaultDependencies({ listPromotions: vi.fn().mockResolvedValue([promotion(1)]), getPromotionCapacity });
    expect((await reconcilePromotionCapacity('studio-a', dependencies)).status).toBe('INITIALIZED');
    expect(getPromotionCapacity).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['missing', undefined],
    ['count mismatch', capacity(2)],
    ['state mismatch', capacity(1, timestamp, { state: 'BROKEN' as 'READY' })],
    ['timestamp mismatch', capacity(1, '2026-11-20T00:00:00.000Z')],
    ['identity mismatch', capacity(1, timestamp, { studioId: 'other' })]
  ])('fails closed after create when the strong reread has %s', async (_label, reread) => {
    const getPromotionCapacity = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(reread);
    const dependencies = defaultDependencies({ listPromotions: vi.fn().mockResolvedValue([promotion(1)]), getPromotionCapacity });
    await expect(reconcilePromotionCapacity('studio-a', dependencies)).rejects.toThrow();
    expect(dependencies.initializePromotionCapacityIfAbsent).toHaveBeenCalledOnce();
    expect(getPromotionCapacity).toHaveBeenCalledTimes(2);
  });

  it('verifies a concurrent initializer through one strong reread without retrying', async () => {
    const raced = capacity(1, '2026-11-20T00:00:00.000Z');
    const getPromotionCapacity = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(raced);
    const initializePromotionCapacityIfAbsent = vi.fn().mockResolvedValue('ALREADY_EXISTS');
    const dependencies = defaultDependencies({
      listPromotions: vi.fn().mockResolvedValue([promotion(1)]), getPromotionCapacity,
      initializePromotionCapacityIfAbsent
    });
    expect(await reconcilePromotionCapacity('studio-a', dependencies)).toEqual({ status: 'VERIFIED_AFTER_RACE', capacity: raced });
    expect(initializePromotionCapacityIfAbsent).toHaveBeenCalledOnce();
    expect(getPromotionCapacity).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, capacity(2)])('fails closed after an initializer race when reread is %o', async (reread) => {
    const getPromotionCapacity = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(reread);
    const dependencies = defaultDependencies({
      listPromotions: vi.fn().mockResolvedValue([promotion(1)]), getPromotionCapacity,
      initializePromotionCapacityIfAbsent: vi.fn().mockResolvedValue('ALREADY_EXISTS')
    });
    await expect(reconcilePromotionCapacity('studio-a', dependencies)).rejects.toThrow();
    expect(dependencies.initializePromotionCapacityIfAbsent).toHaveBeenCalledOnce();
    expect(getPromotionCapacity).toHaveBeenCalledTimes(2);
  });

  it('initializes once across reruns and preserves the original reconciledAtISO', async () => {
    let stored: PromotionCapacity | undefined;
    const initializePromotionCapacityIfAbsent = vi.fn(async (candidate: PromotionCapacity) => {
      if (stored) return 'ALREADY_EXISTS' as const;
      stored = candidate;
      return 'CREATED' as const;
    });
    const dependencies = defaultDependencies({
      listPromotions: vi.fn().mockResolvedValue([promotion(1), promotion(2)]),
      getPromotionCapacity: vi.fn(async () => stored), initializePromotionCapacityIfAbsent
    });
    expect((await reconcilePromotionCapacity('studio-a', dependencies)).status).toBe('INITIALIZED');
    const originalTimestamp = stored!.reconciledAtISO;
    expect((await reconcilePromotionCapacity('studio-a', dependencies)).status).toBe('VERIFIED');
    expect(initializePromotionCapacityIfAbsent).toHaveBeenCalledOnce();
    expect(stored!.reconciledAtISO).toBe(originalTimestamp);
  });

  it.each(['malformed promotion', 'capacity exceeded', 'incomplete traversal'])('stops after canonical catalog failure: %s', async (failure) => {
    const listPromotions = vi.fn().mockRejectedValue(new Error(failure));
    const getPromotionCapacity = vi.fn();
    const initializePromotionCapacityIfAbsent = vi.fn();
    await expect(reconcilePromotionCapacity('studio-a', defaultDependencies({
      listPromotions, getPromotionCapacity, initializePromotionCapacityIfAbsent
    }))).rejects.toThrow(failure);
    expect(getPromotionCapacity).not.toHaveBeenCalled();
    expect(initializePromotionCapacityIfAbsent).not.toHaveBeenCalled();
  });
});
