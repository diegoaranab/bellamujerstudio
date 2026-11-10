import { Injectable, computed, signal } from '@angular/core';

import { MemberClubSession } from './member-club-api.client';

@Injectable({ providedIn: 'root' })
export class MemberClubSessionService {
  private readonly currentSession = signal<MemberClubSession | null>(null);

  readonly hasSession = computed(() => this.currentSession() !== null);
  readonly expiresAtISO = computed(() => this.currentSession()?.expiresAtISO ?? null);

  establish(session: MemberClubSession): void {
    this.currentSession.set({ token: session.token, expiresAtISO: session.expiresAtISO });
  }

  token(): string | null {
    return this.currentSession()?.token ?? null;
  }

  isExpired(now = Date.now()): boolean {
    const session = this.currentSession();
    return session === null || Date.parse(session.expiresAtISO) <= now;
  }

  clear(): void {
    this.currentSession.set(null);
  }
}
