import { randomBytes, randomUUID } from 'crypto';
import { folioDate } from './time';

export const createGiftCardId = (): string => randomUUID();

export const createGiftCardFolio = (createdAt: Date = new Date()): string => {
  const suffix = randomBytes(2).toString('hex').toUpperCase();

  return `BM-REGALO-${folioDate(createdAt)}-${suffix}`;
};
