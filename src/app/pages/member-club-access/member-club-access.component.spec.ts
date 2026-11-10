import { Location } from '@angular/common';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import {
  MemberClubApiClient,
  MemberClubApiError,
  MemberClubSessionResponse
} from '../../core/services/member-club-api.client';
import { MemberClubSessionService } from '../../core/services/member-club-session.service';
import { MemberClubAccessComponent } from './member-club-access.component';

const sessionResponse: MemberClubSessionResponse = {
  session: { token: 'raw-session-token', expiresAtISO: '2099-11-10T20:00:00.000Z' }
};

describe('MemberClubAccessComponent', () => {
  let api: {
    enroll: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    checkSession: ReturnType<typeof vi.fn>;
  };
  let replaceState: ReturnType<typeof vi.fn>;

  async function configure(query: Record<string, string>) {
    api = {
      enroll: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      checkSession: vi.fn()
    };
    replaceState = vi.fn();
    await TestBed.configureTestingModule({
      imports: [MemberClubAccessComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MemberClubApiClient, useValue: api },
        { provide: Location, useValue: { replaceState } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } }
        }
      ]
    }).compileComponents();
  }

  afterEach(() => TestBed.resetTestingModule());

  function setInput(element: HTMLInputElement, value: string): void {
    element.value = value;
    element.dispatchEvent(new Event('input'));
  }

  it('captures and immediately scrubs the invitation from the hash route', async () => {
    await configure({ access: 'opaque access/+', invite: 'one-time-secret' });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(replaceState).toHaveBeenCalledOnce();
    expect(replaceState).toHaveBeenCalledWith(
      '/club/activar',
      'access=opaque%20access%2F%2B'
    );
    expect(fixture.nativeElement.querySelector('[data-testid="member-enrollment"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('one-time-secret');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('enrolls with matching six-digit PINs and establishes the memory session', async () => {
    await configure({ access: 'opaque-handle', invite: 'one-time-secret' });
    api.enroll.mockReturnValue(of(sessionResponse));
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element.querySelector('[data-testid="member-enrollment-pin"]')!, '482731');
    setInput(
      element.querySelector('[data-testid="member-enrollment-confirmation"]')!,
      '482731'
    );
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(api.enroll).toHaveBeenCalledWith('opaque-handle', 'one-time-secret', '482731');
    expect(TestBed.inject(MemberClubSessionService).token()).toBe('raw-session-token');
    expect(element.querySelector('[data-testid="member-session-active"]')).toBeTruthy();
  });

  it('does not submit enrollment when PIN confirmation differs', async () => {
    await configure({ access: 'opaque-handle', invite: 'one-time-secret' });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element.querySelector('[data-testid="member-enrollment-pin"]')!, '482731');
    setInput(
      element.querySelector('[data-testid="member-enrollment-confirmation"]')!,
      '482730'
    );
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(api.enroll).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Los NIP no coinciden.');
  });

  it('shows PIN login on the scrubbed route and never persists the resulting session', async () => {
    await configure({ access: 'opaque-handle' });
    api.login.mockReturnValue(of(sessionResponse));
    const storageSet = vi.spyOn(Storage.prototype, 'setItem');
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(replaceState).not.toHaveBeenCalled();
    expect(element.querySelector('[data-testid="member-login"]')).toBeTruthy();
    setInput(element.querySelector('[data-testid="member-login-pin"]')!, '482731');
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(api.login).toHaveBeenCalledWith('opaque-handle', '482731');
    expect(TestBed.inject(MemberClubSessionService).token()).toBe('raw-session-token');
    expect(storageSet).not.toHaveBeenCalled();
    storageSet.mockRestore();
  });

  it('probes a still-live in-memory session when the member route is revisited', async () => {
    await configure({ access: 'opaque-handle' });
    api.checkSession.mockReturnValue(of({ authenticated: true }));
    TestBed.inject(MemberClubSessionService).establish(sessionResponse.session);

    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(api.checkSession).toHaveBeenCalledWith('raw-session-token');
    expect(
      fixture.nativeElement.querySelector('[data-testid="member-session-active"]')
    ).toBeTruthy();
  });

  it('clears a rejected session probe and returns to PIN login', async () => {
    await configure({ access: 'opaque-handle' });
    api.checkSession.mockReturnValue(
      throwError(() => new MemberClubApiError('authentication', 'safe'))
    );
    TestBed.inject(MemberClubSessionService).establish(sessionResponse.session);

    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(TestBed.inject(MemberClubSessionService).token()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="member-login"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Tu sesión del Club ya no está activa.');
  });

  it('destroys the in-memory token after successful logout', async () => {
    await configure({ access: 'opaque-handle' });
    api.checkSession.mockReturnValue(of({ authenticated: true }));
    api.logout.mockReturnValue(of(undefined));
    TestBed.inject(MemberClubSessionService).establish(sessionResponse.session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="member-logout"]')!
      .click();
    fixture.detectChanges();

    expect(api.logout).toHaveBeenCalledWith('raw-session-token');
    expect(TestBed.inject(MemberClubSessionService).token()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="member-login"]')).toBeTruthy();
  });

  it('also destroys the token when logout revocation cannot be confirmed', async () => {
    await configure({ access: 'opaque-handle' });
    api.checkSession.mockReturnValue(of({ authenticated: true }));
    api.logout.mockReturnValue(throwError(() => new Error('network detail')));
    TestBed.inject(MemberClubSessionService).establish(sessionResponse.session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="member-logout"]')!
      .click();
    fixture.detectChanges();

    expect(TestBed.inject(MemberClubSessionService).token()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'La sesión se cerró en este dispositivo, pero no pudimos confirmarlo con el servidor.'
    );
    expect(fixture.nativeElement.textContent).not.toContain('network detail');
  });

  it('shows a safe invalid-link state when the access handle is absent', async () => {
    await configure({ invite: 'one-time-secret' });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(replaceState).toHaveBeenCalledWith('/club/activar', '');
    expect(fixture.nativeElement.querySelector('[data-testid="member-invalid-link"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('one-time-secret');
  });

  it('does not treat an explicitly empty invitation as a login link', async () => {
    await configure({ access: 'opaque-handle', invite: '' });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(replaceState).toHaveBeenCalledWith('/club/activar', 'access=opaque-handle');
    expect(fixture.nativeElement.querySelector('[data-testid="member-invalid-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="member-login"]')).toBeFalsy();
  });
});
