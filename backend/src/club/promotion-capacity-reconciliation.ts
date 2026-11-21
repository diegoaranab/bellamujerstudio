import { ClubPromotion, PromotionCapacity, validatePromotionCapacity } from './club-model';
import { PromotionCapacityInitializationResult } from './club-persistence';

export interface PromotionCapacityReconciliationDependencies {
  listPromotions(studioId: string): Promise<ClubPromotion[]>;
  getPromotionCapacity(studioId: string): Promise<PromotionCapacity | undefined>;
  initializePromotionCapacityIfAbsent(capacity: PromotionCapacity): Promise<PromotionCapacityInitializationResult>;
  now(): Date;
}

export type PromotionCapacityReconciliationResult =
  | { status: 'INITIALIZED'; capacity: PromotionCapacity }
  | { status: 'VERIFIED'; capacity: PromotionCapacity }
  | { status: 'VERIFIED_AFTER_RACE'; capacity: PromotionCapacity };

/**
 * Reconciles the canonical catalog count with its capacity metadata.
 *
 * Operational precondition: no promotion canonical writer is active. This function
 * does not create or enforce a distributed write freeze; Phase 7A5 owns that gate.
 */
export const reconcilePromotionCapacity = async (
  studioId: string,
  dependencies: PromotionCapacityReconciliationDependencies
): Promise<PromotionCapacityReconciliationResult> => {
  // Traverse and validate the complete canonical catalog before making any capacity decision.
  const promotions = await dependencies.listPromotions(studioId);
  const count = promotions.length;
  if (count > 100) throw new Error('Promotion catalog capacity exceeded');

  const existing = await dependencies.getPromotionCapacity(studioId);
  if (existing !== undefined) {
    const validated = validateExistingCapacity(existing, studioId);
    if (validated.count !== count) throw new Error('Promotion capacity reconciliation mismatch');
    return { status: 'VERIFIED', capacity: validated };
  }

  const timestamp = dependencies.now();
  if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
    throw new Error('Invalid promotion capacity reconciliation clock');
  }
  const candidate: PromotionCapacity = {
    studioId,
    count,
    state: 'READY',
    reconciledAtISO: timestamp.toISOString()
  };
  validatePromotionCapacity(candidate);

  const initialized = await dependencies.initializePromotionCapacityIfAbsent(candidate);
  if (initialized === 'CREATED') {
    const persisted = await dependencies.getPromotionCapacity(studioId);
    if (!persisted) throw new Error('Promotion capacity missing after initialization');
    const validated = validateExistingCapacity(persisted, studioId);
    if (validated.count !== count || validated.state !== 'READY' ||
        validated.reconciledAtISO !== candidate.reconciledAtISO) {
      throw new Error('Promotion capacity initialization verification failed');
    }
    return { status: 'INITIALIZED', capacity: validated };
  }

  if (initialized === 'ALREADY_EXISTS') {
    const persisted = await dependencies.getPromotionCapacity(studioId);
    if (!persisted) throw new Error('Promotion capacity missing after initialization race');
    const validated = validateExistingCapacity(persisted, studioId);
    if (validated.count !== count || validated.state !== 'READY') {
      throw new Error('Promotion capacity reconciliation mismatch after initialization race');
    }
    return { status: 'VERIFIED_AFTER_RACE', capacity: validated };
  }

  throw new Error('Unexpected promotion capacity initialization result');
};

const validateExistingCapacity = (capacity: PromotionCapacity, studioId: string): PromotionCapacity => {
  const validated = validatePromotionCapacity(capacity);
  if (validated.studioId !== studioId) throw new Error('Promotion capacity identity mismatch');
  return validated;
};
