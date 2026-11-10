import { AccessSession, MemberAccessState } from './club-access-model';

export const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

export interface FailedPinTransition {
  failedPinAttempts: number;
  nextAllowedAtISO?: string;
}

export const failedPinTransition = (
  currentFailures: number,
  attemptedAt: Date
): FailedPinTransition => {
  if (!Number.isSafeInteger(currentFailures) || currentFailures < 0 ||
    !(attemptedAt instanceof Date) || !Number.isFinite(attemptedAt.getTime())) {
    throw new Error('Invalid Club PIN failure transition');
  }
  const failedPinAttempts = currentFailures + 1;
  if (!Number.isSafeInteger(failedPinAttempts)) {
    throw new Error('Club PIN failure counter exhausted');
  }
  const delaySeconds = failedPinAttempts < 3 ? 0
    : failedPinAttempts === 3 ? 30
      : failedPinAttempts === 4 ? 2 * 60
        : failedPinAttempts === 5 ? 10 * 60
          : 60 * 60;
  return {
    failedPinAttempts,
    ...(delaySeconds > 0
      ? { nextAllowedAtISO: new Date(attemptedAt.getTime() + delaySeconds * 1000).toISOString() }
      : {})
  };
};

export const createSessionRecord = (
  state: MemberAccessState,
  sessionDigest: string,
  createdAt: Date
): AccessSession => {
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) {
    throw new Error('Invalid Club session clock');
  }
  const expiresAt = new Date(createdAt.getTime() + SESSION_LIFETIME_MS);
  return {
    sessionDigest,
    studioId: state.studioId,
    clientId: state.clientId,
    credentialVersion: state.credentialVersion,
    createdAtISO: createdAt.toISOString(),
    expiresAtISO: expiresAt.toISOString(),
    expiresAtEpoch: Math.floor(expiresAt.getTime() / 1000),
    revoked: false
  };
};
