import { TestBed } from '@angular/core/testing';

import { MemberClubSessionService } from './member-club-session.service';

const TOKEN_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TOKEN_B = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';

describe('MemberClubSessionService', () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    TestBed.inject(MemberClubSessionService, null)?.clear();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('holds a valid session only in memory and clears it at absolute expiry', () => {
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const storageSet = vi.spyOn(Storage.prototype, 'setItem');
    const service = TestBed.inject(MemberClubSessionService);

    expect(
      service.establish({ token: TOKEN_A, expiresAtISO: '2030-01-01T00:00:10.000Z' })
    ).toBe(true);
    expect(service.token()).toBe(TOKEN_A);
    expect(storageSet).not.toHaveBeenCalled();

    vi.advanceTimersByTime(9999);
    expect(service.token()).toBe(TOKEN_A);
    vi.advanceTimersByTime(1);
    expect(service.token()).toBeNull();
    storageSet.mockRestore();
  });

  it('cancels the previous expiry timer when a new session replaces it', () => {
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const service = TestBed.inject(MemberClubSessionService);
    service.establish({ token: TOKEN_A, expiresAtISO: '2030-01-01T00:00:05.000Z' });

    vi.advanceTimersByTime(1000);
    service.establish({ token: TOKEN_B, expiresAtISO: '2030-01-01T00:00:10.000Z' });
    vi.advanceTimersByTime(4000);
    expect(service.token()).toBe(TOKEN_B);
    vi.advanceTimersByTime(5000);
    expect(service.token()).toBeNull();
  });

  it('cancels the expiry timer when explicitly cleared', () => {
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const service = TestBed.inject(MemberClubSessionService);
    service.establish({ token: TOKEN_A, expiresAtISO: '2030-01-01T00:00:05.000Z' });
    service.clear();

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(service.token()).toBeNull();
  });

  it.each([
    ['invalid token', 'not-a-token', '2030-01-01T00:00:05.000Z'],
    ['invalid expiry', TOKEN_A, 'not-a-date'],
    ['expired session', TOKEN_A, '2029-12-31T23:59:59.999Z']
  ])('rejects an %s', (_label, token, expiresAtISO) => {
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const service = TestBed.inject(MemberClubSessionService);
    expect(service.establish({ token, expiresAtISO })).toBe(false);
    expect(service.token()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
