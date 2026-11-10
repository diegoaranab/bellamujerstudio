import { randomUUID } from 'crypto';

export const createClubClientId = (): string =>
  randomUUID().toLowerCase();
