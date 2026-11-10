import { TestBed } from '@angular/core/testing';

import { MemberClubSessionService } from './member-club-session.service';

describe('MemberClubSessionService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('holds and clears the raw session only in service memory', () => {
    const storageSet = vi.spyOn(Storage.prototype, 'setItem');
    const service = TestBed.inject(MemberClubSessionService);

    service.establish({
      token: 'raw-member-session',
      expiresAtISO: '2099-11-10T20:00:00.000Z'
    });

    expect(service.hasSession()).toBe(true);
    expect(service.token()).toBe('raw-member-session');
    expect(service.expiresAtISO()).toBe('2099-11-10T20:00:00.000Z');
    expect(service.isExpired(new Date('2099-11-10T19:59:59.000Z').getTime())).toBe(false);
    expect(storageSet).not.toHaveBeenCalled();

    service.clear();
    expect(service.hasSession()).toBe(false);
    expect(service.token()).toBeNull();

    storageSet.mockRestore();
  });

  it('treats an absent or expired session as expired', () => {
    const service = TestBed.inject(MemberClubSessionService);
    expect(service.isExpired()).toBe(true);
    service.establish({ token: 'session', expiresAtISO: '2026-11-10T20:00:00.000Z' });
    expect(service.isExpired(new Date('2026-11-10T20:00:00.000Z').getTime())).toBe(true);
  });
});
