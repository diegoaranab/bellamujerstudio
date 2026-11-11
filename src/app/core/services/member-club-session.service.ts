import { Injectable, OnDestroy, computed, signal } from '@angular/core';

import { MemberClubSession } from './member-club-api.client';
import { isCanonicalMemberClubCredential } from './member-club-credential';

@Injectable({ providedIn: 'root' })
export class MemberClubSessionService implements OnDestroy {
  private readonly currentSession = signal<MemberClubSession | null>(null);
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  readonly hasSession = computed(() => this.currentSession() !== null);
  readonly expiresAtISO = computed(() => this.currentSession()?.expiresAtISO ?? null);

  establish(session: MemberClubSession): boolean {
    const expiresAt = Date.parse(session.expiresAtISO);
    if (
      !isCanonicalMemberClubCredential(session.token) ||
      !Number.isFinite(expiresAt) ||
      new Date(expiresAt).toISOString() !== session.expiresAtISO ||
      expiresAt <= Date.now()
    ) {
      this.clear();
      return false;
    }

    this.cancelExpiryTimer();
    this.currentSession.set({ token: session.token, expiresAtISO: session.expiresAtISO });
    this.expiryTimer = setTimeout(() => this.clear(), expiresAt - Date.now());
    return true;
  }

  token(): string | null {
    return this.currentSession()?.token ?? null;
  }

  isExpired(now = Date.now()): boolean {
    const session = this.currentSession();
    return session === null || Date.parse(session.expiresAtISO) <= now;
  }

  clear(): void {
    this.cancelExpiryTimer();
    this.currentSession.set(null);
  }

  ngOnDestroy(): void {
    this.clear();
  }

  private cancelExpiryTimer(): void {
    if (this.expiryTimer === null) return;
    clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
  }
}
