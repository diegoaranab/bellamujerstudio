import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
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
  let navigate: ReturnType<typeof vi.fn>;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function configure(query: Record<string, string>, path = 'club/activar') {
    api = {
      enroll: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      checkSession: vi.fn()
    };
    navigate = vi.fn().mockResolvedValue(true);
    queryParams = new BehaviorSubject(convertToParamMap(query));
    await TestBed.configureTestingModule({
      imports: [MemberClubAccessComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MemberClubApiClient, useValue: api },
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

    expect(navigate).toHaveBeenCalledWith(['/club/activar'], {
      queryParams: { access: ACCESS_A },
      replaceUrl: true
    });
    expect(fixture.nativeElement.querySelector('[data-testid="member-enrollment"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain(INVITE_A);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('synchronizes the Router so the same original activation link is processed and scrubbed again', async () => {
    api = {
      enroll: vi.fn().mockReturnValue(of(sessionResponse())),
      login: vi.fn(),
      logout: vi.fn(),
      checkSession: vi.fn()
    };
    await TestBed.configureTestingModule({
      imports: [MemberClubAccessComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MemberClubApiClient, useValue: api },
        provideRouter([{ path: 'club/activar', component: MemberClubAccessComponent }])
      ]
    }).compileComponents();
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    const applicationRef = TestBed.inject(ApplicationRef);
    const originalUrl = `/club/activar?access=${ACCESS_A}&invite=${INVITE_A}`;
    const scrubbedUrl = `/club/activar?access=${ACCESS_A}`;

    await harness.navigateByUrl(originalUrl, MemberClubAccessComponent);
    await applicationRef.whenStable();

    expect(router.url).toBe(scrubbedUrl);
    expect(
      harness.routeNativeElement?.querySelector('[data-testid="member-enrollment"]')
    ).toBeTruthy();

    const scrubNavigate = vi.spyOn(router, 'navigate');
    await router.navigateByUrl(originalUrl);
    await applicationRef.whenStable();

    expect(scrubNavigate).toHaveBeenCalledWith(['/club/activar'], {
      queryParams: { access: ACCESS_A },
      replaceUrl: true
    });
    expect(router.url).toBe(scrubbedUrl);
    const element = harness.routeNativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="member-enrollment"]')).toBeTruthy();
    setInput(element.querySelector('[data-testid="member-enrollment-pin"]')!, '482730');
    setInput(element.querySelector('[data-testid="member-enrollment-confirmation"]')!, '482730');
    submit(element);
    await applicationRef.whenStable();

    expect(api.enroll).toHaveBeenCalledWith(ACCESS_A, INVITE_A, '482730');
  });

  it('scrubs structurally invalid activation credentials and shows only the generic state', async () => {
    await configure({ access: 'not-canonical', invite: 'also-not-canonical' });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/club/activar'], {
      queryParams: undefined,
      replaceUrl: true
    });
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

    expect(navigate).toHaveBeenLastCalledWith(['/club/activar'], {
      queryParams: { access: ACCESS_B },
      replaceUrl: true
    });
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

  it.each([
    ['invalid link', {}, 'member-invalid-link-recovery'],
    ['reopen private link', { access: ACCESS_A }, 'member-reopen-private-link-recovery']
  ])('offers safe WhatsApp recovery for %s', async (_state, query, recoveryTestId) => {
    await configure(query);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const recovery = element.querySelector<HTMLAnchorElement>(`[data-testid="${recoveryTestId}"]`)!;
    const href = recovery.href;
    const message = new URL(href).searchParams.get('text')!;

    expect(href).toContain('https://wa.me/');
    expect(decodeURIComponent(message)).toContain('recuperar mi acceso a Bella Mujer Club');
    expect(decodeURIComponent(message)).toContain('nuevo enlace privado');
    for (const secret of [ACCESS_A, ACCESS_B, INVITE_A, INVITE_B, SESSION_TOKEN, '482731']) {
      expect(href).not.toContain(secret);
      expect(element.textContent).not.toContain(secret);
    }
    expect(recovery.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('uses truthful current-tab session copy without a future Club destination', async () => {
    await configure({ access: ACCESS_A }, 'club');
    api.checkSession.mockReturnValue(of({ authenticated: true }));
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Tu acceso al Club está verificado en esta pestaña.');
    expect(element.textContent).toContain('se pierde al recargarla o cerrarla');
    expect(element.textContent).not.toContain('Ya puedes continuar con tu experiencia');
    expect(element.textContent).not.toContain('Ir a Mi Club');
  });

  it('reveals and conceals the login NIP without changing its value or authentication affordances', async () => {
    await configure({ access: ACCESS_A }, 'club');
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('[data-testid="member-login-pin"]')!;
    const reveal = element.querySelector<HTMLButtonElement>('[data-testid="member-login-reveal"]')!;
    setInput(input, '482731');

    expect(input.type).toBe('password');
    expect(input.autocomplete).toBe('current-password');
    expect(input.inputMode).toBe('numeric');
    reveal.click();
    fixture.detectChanges();
    expect(input.type).toBe('text');
    expect(input.value).toBe('482731');
    expect(reveal.getAttribute('aria-label')).toBe('Ocultar NIP');
    reveal.click();
    fixture.detectChanges();
    expect(input.type).toBe('password');
    expect(input.value).toBe('482731');
  });

  it('reveals both enrollment NIP fields while preserving their autocomplete and input mode', async () => {
    await configure({ access: ACCESS_A, invite: INVITE_A });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const pin = element.querySelector<HTMLInputElement>('[data-testid="member-enrollment-pin"]')!;
    const confirmation = element.querySelector<HTMLInputElement>(
      '[data-testid="member-enrollment-confirmation"]'
    )!;

    element
      .querySelector<HTMLButtonElement>('[data-testid="member-enrollment-reveal"]')!
      .click();
    fixture.detectChanges();
    expect(pin.type).toBe('text');
    expect(confirmation.type).toBe('text');
    expect(pin.autocomplete).toBe('new-password');
    expect(confirmation.autocomplete).toBe('new-password');
    expect(pin.inputMode).toBe('numeric');
    expect(confirmation.inputMode).toBe('numeric');
  });

  it('returns focus to the first invalid enrollment field after client-side validation fails', async () => {
    await configure({ access: ACCESS_A, invite: INVITE_A });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    submit(element);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(
      element.querySelector('[data-testid="member-enrollment-pin"]')
    );

    setInput(element.querySelector('[data-testid="member-enrollment-pin"]')!, '482731');
    submit(element);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(
      element.querySelector('[data-testid="member-enrollment-confirmation"]')
    );
  });

  it('focuses confirmation for a mismatched enrollment and the login NIP for invalid login', async () => {
    await configure({ access: ACCESS_A, invite: INVITE_A });
    const enrollmentFixture = TestBed.createComponent(MemberClubAccessComponent);
    enrollmentFixture.detectChanges();
    const enrollment = enrollmentFixture.nativeElement as HTMLElement;
    setInput(enrollment.querySelector('[data-testid="member-enrollment-pin"]')!, '482731');
    setInput(
      enrollment.querySelector('[data-testid="member-enrollment-confirmation"]')!,
      '482730'
    );
    submit(enrollment);
    enrollmentFixture.detectChanges();
    await enrollmentFixture.whenStable();
    expect(document.activeElement).toBe(
      enrollment.querySelector('[data-testid="member-enrollment-confirmation"]')
    );

    TestBed.resetTestingModule();
    await configure({ access: ACCESS_A }, 'club');
    const loginFixture = TestBed.createComponent(MemberClubAccessComponent);
    loginFixture.detectChanges();
    const login = loginFixture.nativeElement as HTMLElement;
    submit(login);
    loginFixture.detectChanges();
    await loginFixture.whenStable();
    expect(document.activeElement).toBe(login.querySelector('[data-testid="member-login-pin"]'));
    expect(api.login).not.toHaveBeenCalled();
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
