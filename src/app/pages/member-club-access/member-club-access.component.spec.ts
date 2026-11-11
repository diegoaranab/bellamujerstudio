import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { routes } from '../../app.routes';
import {
  MemberClubApiClient,
  MemberClubApiError,
  MemberClubSessionResponse
} from '../../core/services/member-club-api.client';
import { MemberClubSessionService } from '../../core/services/member-club-session.service';
import { MemberClubAccessComponent } from './member-club-access.component';

const ACCESS_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ACCESS_B = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
const INVITE_A = 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI';
const INVITE_B = 'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM';
const SESSION_TOKEN = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc';

function futureISO(milliseconds = 60 * 60 * 1000): string {
  return new Date(Date.now() + milliseconds).toISOString();
}

describe('MemberClubAccessComponent', () => {
  let api: {
    enroll: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    checkSession: ReturnType<typeof vi.fn>;
  };
  let replaceState: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function configure(query: Record<string, string>, path = 'club/activar') {
    api = {
      enroll: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      checkSession: vi.fn()
    };
    replaceState = vi.fn();
    navigate = vi.fn().mockResolvedValue(true);
    queryParams = new BehaviorSubject(convertToParamMap(query));
    await TestBed.configureTestingModule({
      imports: [MemberClubAccessComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MemberClubApiClient, useValue: api },
        { provide: Location, useValue: { replaceState } },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { routeConfig: { path }, queryParamMap: queryParams.value },
            queryParamMap: queryParams.asObservable()
          }
        }
      ]
    }).compileComponents();
  }

  afterEach(() => {
    TestBed.inject(MemberClubSessionService, null)?.clear();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  function sessionResponse(): MemberClubSessionResponse {
    return { session: { token: SESSION_TOKEN, expiresAtISO: futureISO() } };
  }

  function setInput(element: HTMLInputElement, value: string): void {
    element.value = value;
    element.dispatchEvent(new Event('input'));
  }

  function submit(element: HTMLElement): void {
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  it('registers the normal /club member route', () => {
    expect(routes.some((route) => route.path === 'club' && route.loadComponent)).toBe(true);
  });

  it('captures a canonical invitation and immediately scrubs it from the activation route', async () => {
    await configure({ access: ACCESS_A, invite: INVITE_A });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(replaceState).toHaveBeenCalledWith('/club/activar', `access=${ACCESS_A}`);
    expect(fixture.nativeElement.querySelector('[data-testid="member-enrollment"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain(INVITE_A);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('scrubs structurally invalid activation credentials and shows only the generic state', async () => {
    await configure({ access: 'not-canonical', invite: 'also-not-canonical' });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(replaceState).toHaveBeenCalledWith('/club/activar', '');
    expect(fixture.nativeElement.querySelector('[data-testid="member-invalid-link"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('not-canonical');
  });

  it('replaces an old invitation when the reused component receives new query parameters', async () => {
    await configure({ access: ACCESS_A, invite: INVITE_A });
    api.enroll.mockReturnValue(of(sessionResponse()));
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    queryParams.next(convertToParamMap({ access: ACCESS_B, invite: INVITE_B }));
    fixture.detectChanges();

    expect(replaceState).toHaveBeenLastCalledWith('/club/activar', `access=${ACCESS_B}`);
    const element = fixture.nativeElement as HTMLElement;
    setInput(element.querySelector('[data-testid="member-enrollment-pin"]')!, '482730');
    setInput(element.querySelector('[data-testid="member-enrollment-confirmation"]')!, '482730');
    submit(element);
    fixture.detectChanges();

    expect(api.enroll).toHaveBeenCalledOnce();
    expect(api.enroll).toHaveBeenCalledWith(ACCESS_B, INVITE_B, '482730');
    expect(api.enroll).not.toHaveBeenCalledWith(ACCESS_A, INVITE_A, expect.anything());
  });

  it('recomputes PIN mismatch when only the first PIN changes and then enrolls', async () => {
    await configure({ access: ACCESS_A, invite: INVITE_A });
    api.enroll.mockReturnValue(of(sessionResponse()));
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const pin = element.querySelector<HTMLInputElement>('[data-testid="member-enrollment-pin"]')!;

    setInput(pin, '482731');
    setInput(
      element.querySelector('[data-testid="member-enrollment-confirmation"]')!,
      '482730'
    );
    submit(element);
    fixture.detectChanges();
    expect(api.enroll).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Los NIP no coinciden.');

    setInput(pin, '482730');
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Los NIP no coinciden.');
    submit(element);
    fixture.detectChanges();

    expect(api.enroll).toHaveBeenCalledWith(ACCESS_A, INVITE_A, '482730');
  });

  it('normalizes successful enrollment to /club with replace semantics and no secret', async () => {
    await configure({ access: ACCESS_A, invite: INVITE_A });
    api.enroll.mockReturnValue(of(sessionResponse()));
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element.querySelector('[data-testid="member-enrollment-pin"]')!, '482731');
    setInput(element.querySelector('[data-testid="member-enrollment-confirmation"]')!, '482731');
    submit(element);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/club'], {
      queryParams: { access: ACCESS_A },
      replaceUrl: true
    });
    expect(JSON.stringify(navigate.mock.calls)).not.toContain(INVITE_A);
    expect(JSON.stringify(navigate.mock.calls)).not.toContain(SESSION_TOKEN);
    expect(JSON.stringify(navigate.mock.calls)).not.toContain('482731');
  });

  it('normalizes successful login without persisting authentication secrets', async () => {
    await configure({ access: ACCESS_A }, 'club');
    api.login.mockReturnValue(of(sessionResponse()));
    const storageSet = vi.spyOn(Storage.prototype, 'setItem');
    const initialCookie = document.cookie;
    const initialHistoryState = history.state;
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element.querySelector('[data-testid="member-login-pin"]')!, '482731');
    submit(element);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/club'], {
      queryParams: { access: ACCESS_A },
      replaceUrl: true
    });
    expect(storageSet).not.toHaveBeenCalled();
    expect(document.cookie).toBe(initialCookie);
    expect(history.state).toBe(initialHistoryState);
    expect(JSON.stringify(navigate.mock.calls)).not.toContain(SESSION_TOKEN);
    storageSet.mockRestore();
  });

  it('shows reopen-private-link state on activation reload without an invitation', async () => {
    await configure({ access: ACCESS_A });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="member-reopen-private-link"]')
    ).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="member-login"]')).toBeFalsy();
  });

  it('clears a session after an authentication-denied probe', async () => {
    await configure({ access: ACCESS_A }, 'club');
    api.checkSession.mockReturnValue(
      throwError(() => new MemberClubApiError('authentication', 'safe'))
    );
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(TestBed.inject(MemberClubSessionService).token()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="member-login"]')).toBeTruthy();
  });

  it.each(['network', 'server'] as const)(
    'retains the session after a %s probe failure and retries only explicitly',
    async (kind) => {
      await configure({ access: ACCESS_A }, 'club');
      api.checkSession
        .mockReturnValueOnce(throwError(() => new MemberClubApiError(kind, 'detail')))
        .mockReturnValueOnce(of({ authenticated: true }));
      TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
      const fixture = TestBed.createComponent(MemberClubAccessComponent);
      fixture.detectChanges();

      expect(TestBed.inject(MemberClubSessionService).token()).toBe(SESSION_TOKEN);
      expect(api.checkSession).toHaveBeenCalledOnce();
      const retry = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="member-session-verification-error"] button'
      )!;
      expect(retry.textContent).toContain('Intentar de nuevo');

      retry.click();
      fixture.detectChanges();
      expect(api.checkSession).toHaveBeenCalledTimes(2);
      expect(api.checkSession).toHaveBeenLastCalledWith(SESSION_TOKEN);
    }
  );

  it('clears the session after successful logout', async () => {
    await configure({ access: ACCESS_A }, 'club');
    api.checkSession.mockReturnValue(of({ authenticated: true }));
    api.logout.mockReturnValue(of(undefined));
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="member-logout"]')!
      .click();
    fixture.detectChanges();

    expect(api.logout).toHaveBeenCalledWith(SESSION_TOKEN);
    expect(TestBed.inject(MemberClubSessionService).token()).toBeNull();
  });

  it.each(['network', 'server'] as const)(
    'retains the session after a %s logout failure and permits explicit retry',
    async (kind) => {
      await configure({ access: ACCESS_A }, 'club');
      api.checkSession.mockReturnValue(of({ authenticated: true }));
      api.logout.mockReturnValue(
        throwError(() => new MemberClubApiError(kind, 'private detail'))
      );
      TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
      const fixture = TestBed.createComponent(MemberClubAccessComponent);
      fixture.detectChanges();
      const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="member-logout"]'
      )!;

      button.click();
      fixture.detectChanges();
      expect(TestBed.inject(MemberClubSessionService).token()).toBe(SESSION_TOKEN);
      expect(fixture.nativeElement.textContent).toContain(
        'No pudimos confirmar el cierre de sesión. Intenta nuevamente.'
      );

      button.click();
      expect(api.logout).toHaveBeenCalledTimes(2);
      expect(api.logout).toHaveBeenLastCalledWith(SESSION_TOKEN);
    }
  );

  it('counts down a throttled login without retrying automatically', async () => {
    vi.useFakeTimers();
    await configure({ access: ACCESS_A }, 'club');
    api.login.mockReturnValue(
      throwError(() => new MemberClubApiError('throttled', 'safe', 2))
    );
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    setInput(element.querySelector('[data-testid="member-login-pin"]')!, '482731');
    submit(element);
    fixture.detectChanges();

    const button = element.querySelector<HTMLButtonElement>('[data-testid="member-login-submit"]')!;
    expect(button.disabled).toBe(true);
    expect(element.textContent).toContain('Espera 2 segundos');

    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(api.login).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(false);
    expect(element.querySelector('[data-testid="member-login-throttle"]')).toBeFalsy();
  });

  it('destroys a rejected invitation and does not reuse it', async () => {
    await configure({ access: ACCESS_A, invite: INVITE_A });
    api.enroll.mockReturnValue(
      throwError(() => new MemberClubApiError('invitation', 'safe invitation error'))
    );
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    setInput(element.querySelector('[data-testid="member-enrollment-pin"]')!, '482731');
    setInput(element.querySelector('[data-testid="member-enrollment-confirmation"]')!, '482731');
    submit(element);
    fixture.detectChanges();

    expect(api.enroll).toHaveBeenCalledOnce();
    expect(element.querySelector('[data-testid="member-invalid-link"]')).toBeTruthy();
    queryParams.next(convertToParamMap({ access: ACCESS_A }));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="member-reopen-private-link"]')).toBeTruthy();
    expect(api.enroll).toHaveBeenCalledOnce();
  });

  it('clears the entered PIN after authentication failure but not after a server failure', async () => {
    await configure({ access: ACCESS_A }, 'club');
    api.login.mockReturnValueOnce(
      throwError(() => new MemberClubApiError('authentication', 'safe'))
    );
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('[data-testid="member-login-pin"]')!;
    setInput(input, '482731');
    submit(element);
    fixture.detectChanges();
    expect(input.value).toBe('');

    api.login.mockReturnValueOnce(throwError(() => new MemberClubApiError('server', 'safe')));
    setInput(input, '482731');
    submit(element);
    fixture.detectChanges();
    expect(input.value).toBe('482731');
  });
});
