import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import { routes } from '../../app.routes';
import {
  MemberClubApiClient,
  MemberClubApiError,
  MemberClubSelfSummary,
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
    getSelfSummary: ReturnType<typeof vi.fn>;
    getHistory: ReturnType<typeof vi.fn>;
    getQr: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.fn>;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function configure(query: Record<string, string>, path = 'club/activar') {
    api = {
      enroll: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      getSelfSummary: vi.fn().mockReturnValue(of(memberSummary())),
      getHistory: vi.fn().mockReturnValue(of({ items: [] })),
      getQr: vi.fn()
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

  function sessionResponseFor(token: string): MemberClubSessionResponse {
    return { session: { token, expiresAtISO: futureISO() } };
  }

  function memberSummary(stampCount = 3): MemberClubSelfSummary {
    return { profile: { name: 'Mariana Prueba' }, loyalty: { stampCount } };
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

  it('renders the approved official logo with a stable relative asset path and accessible name', async () => {
    await configure({});
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    const logo = fixture.nativeElement.querySelector(
      '[data-testid="member-access-official-logo"]'
    ) as HTMLImageElement | null;
    expect(logo?.getAttribute('src')).toBe('brand/bella-mujer-logo-master.png');
    expect(logo?.getAttribute('alt')).toBe('Bella Mujer Studio');
    expect(logo?.getAttribute('width')).toBe('1563');
    expect(logo?.getAttribute('height')).toBe('1563');
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
      getSelfSummary: vi.fn().mockReturnValue(of(memberSummary())),
      getHistory: vi.fn().mockReturnValue(of({ items: [] })),
      getQr: vi.fn()
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

  it('loads the real member home without inventing a reward destination', async () => {
    await configure({ access: ACCESS_A }, 'club');
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(api.getSelfSummary).toHaveBeenCalledWith(SESSION_TOKEN);
    expect(element.querySelector('[data-testid="member-club-home"]')).toBeTruthy();
    expect(element.textContent).toContain('Hola, Mariana Prueba');
    expect(element.textContent).toContain('3 sellos');
    expect(element.textContent).not.toContain('Sesión válida hasta');
    expect(element.textContent).not.toContain('3 de 4');
    expect(element.textContent).toContain('Mi QR');
    for (const destination of ['Promociones', 'Recompensas']) {
      expect(element.textContent).not.toContain(destination);
    }
    expect(api.getQr).not.toHaveBeenCalled();
  });

  it('loads QR only after reveal, clears it on hide, and requests a fresh one when reopened', async () => {
    await configure({ access: ACCESS_A }, 'club');
    const pending = new Subject<{ identifier: string }>();
    const uuid = '123e4567-e89b-42d3-a456-426614174000';
    api.getQr.mockReturnValueOnce(pending).mockReturnValueOnce(of({ identifier: uuid }));
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    expect(api.getQr).not.toHaveBeenCalled();

    const toggle = () => fixture.nativeElement.querySelector('[data-testid="member-qr-toggle"]') as HTMLButtonElement;
    toggle().click();
    fixture.detectChanges();
    expect(api.getQr).toHaveBeenCalledTimes(1);
    pending.next({ identifier: uuid });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="member-qr-image"]')?.getAttribute('src')).toMatch(/^data:image\/gif;base64,/);
    expect(fixture.nativeElement.textContent).not.toContain(uuid);

    toggle().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="member-qr-image"]')).toBeNull();
    toggle().click();
    fixture.detectChanges();
    expect(api.getQr).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('[data-testid="member-qr-image"]')).toBeTruthy();
  });

  it.each([
    [0, '0 sellos'],
    [1, '1 sello'],
    [8, '8 sellos']
  ])('renders the real singular/plural stamp count: %s', async (stampCount, expectedCopy) => {
    await configure({ access: ACCESS_A }, 'club');
    api.getSelfSummary.mockReturnValue(of(memberSummary(stampCount)));
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(expectedCopy);
  });

  it('bounds decorative earned-stamp marks while keeping the full count authoritative', async () => {
    await configure({ access: ACCESS_A }, 'club');
    api.getSelfSummary.mockReturnValue(of(memberSummary(125)));
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const stampMarks = element.querySelector('[data-testid="member-earned-stamps"]')!;

    expect(element.textContent).toContain('125 sellos acumulados');
    expect(stampMarks.getAttribute('aria-hidden')).toBe('true');
    expect(stampMarks.querySelectorAll('.member-progress__seal')).toHaveLength(8);
    expect(
      stampMarks.querySelector('[data-testid="member-earned-stamps-overflow"]')?.textContent
    ).toContain('+117');
  });

  it('renders a stable summary loading state and prevents concurrent requests', async () => {
    await configure({ access: ACCESS_A }, 'club');
    const pending = new Subject<MemberClubSelfSummary>();
    api.getSelfSummary.mockReturnValue(pending);
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="member-home-loading"]')).toBeTruthy();
    queryParams.next(convertToParamMap({ access: ACCESS_A }));
    fixture.detectChanges();
    expect(api.getSelfSummary).toHaveBeenCalledOnce();

    pending.next(memberSummary());
    pending.complete();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="member-club-home"]')).toBeTruthy();
  });

  it('scrubs an invitation immediately while an identical member summary is loading', async () => {
    await configure({ access: ACCESS_A }, 'club');
    const pending = new Subject<MemberClubSelfSummary>();
    api.getSelfSummary.mockReturnValue(pending);
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(api.getSelfSummary).toHaveBeenCalledOnce();
    queryParams.next(convertToParamMap({ access: ACCESS_A, invite: INVITE_A }));
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/club'], {
      queryParams: { access: ACCESS_A },
      replaceUrl: true
    });
    expect(api.getSelfSummary).toHaveBeenCalledOnce();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(INVITE_A);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('clears loaded member data when the member session expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    await configure({ access: ACCESS_A }, 'club');
    TestBed.inject(MemberClubSessionService).establish({
      token: SESSION_TOKEN,
      expiresAtISO: futureISO(1000)
    });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-testid="member-club-home"]')).toBeTruthy();
    expect(element.textContent).toContain('Mariana Prueba');
    expect(element.textContent).toContain('3 sellos');

    vi.advanceTimersByTime(1000);
    fixture.detectChanges();

    expect(TestBed.inject(MemberClubSessionService).token()).toBeNull();
    expect(element.querySelector('[data-testid="member-club-home"]')).toBeFalsy();
    expect(element.textContent).not.toContain('Mariana Prueba');
    expect(element.textContent).not.toContain('3 sellos');
    expect(element.querySelector('[data-testid="member-login"]')).toBeTruthy();
  });

  it('discards an in-flight member summary when its session expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    await configure({ access: ACCESS_A }, 'club');
    const pending = new Subject<MemberClubSelfSummary>();
    api.getSelfSummary.mockReturnValue(pending);
    TestBed.inject(MemberClubSessionService).establish({
      token: SESSION_TOKEN,
      expiresAtISO: futureISO(1000)
    });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(api.getSelfSummary).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    pending.next(memberSummary());
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="member-club-home"]')).toBeFalsy();
    expect(element.textContent).not.toContain('Mariana Prueba');
    expect(element.querySelector('[data-testid="member-login"]')).toBeTruthy();
  });

  it('does not let an old member summary overwrite a newer session', async () => {
    await configure({ access: ACCESS_A }, 'club');
    const first = new Subject<MemberClubSelfSummary>();
    const second = new Subject<MemberClubSelfSummary>();
    api.getSelfSummary.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const session = TestBed.inject(MemberClubSessionService);
    session.establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    session.establish({ token: ACCESS_B, expiresAtISO: futureISO() });
    fixture.detectChanges();
    first.next(memberSummary(3));
    second.next(memberSummary(8));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(api.getSelfSummary).toHaveBeenCalledTimes(2);
    expect(element.textContent).toContain('8 sellos');
    expect(element.textContent).not.toContain('3 sellos');
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

  it('conceals enrollment NIP fields when reused for a new activation state', async () => {
    await configure({ access: ACCESS_A, invite: INVITE_A });
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('[data-testid="member-enrollment-reveal"]')!.click();
    fixture.detectChanges();
    expect(
      element.querySelector<HTMLInputElement>('[data-testid="member-enrollment-pin"]')!.type
    ).toBe('text');

    queryParams.next(convertToParamMap({ access: ACCESS_B, invite: INVITE_B }));
    fixture.detectChanges();

    expect(
      element.querySelector<HTMLInputElement>('[data-testid="member-enrollment-pin"]')!.type
    ).toBe('password');
    expect(
      element.querySelector<HTMLInputElement>('[data-testid="member-enrollment-confirmation"]')!.type
    ).toBe('password');
    expect(
      element.querySelector<HTMLButtonElement>('[data-testid="member-enrollment-reveal"]')!
        .getAttribute('aria-label')
    ).toBe('Mostrar NIP');
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

  it('clears a session after an authentication-denied self-summary request', async () => {
    await configure({ access: ACCESS_A }, 'club');
    api.getSelfSummary.mockReturnValue(
      throwError(() => new MemberClubApiError('authentication', 'safe'))
    );
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(TestBed.inject(MemberClubSessionService).token()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="member-login"]')).toBeTruthy();
  });

  it.each(['network', 'server'] as const)(
    'retains the session after a %s self-summary failure and retries only explicitly',
    async (kind) => {
      await configure({ access: ACCESS_A }, 'club');
      api.getSelfSummary
        .mockReturnValueOnce(throwError(() => new MemberClubApiError(kind, 'detail')))
        .mockReturnValueOnce(of(memberSummary()));
      TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
      const fixture = TestBed.createComponent(MemberClubAccessComponent);
      fixture.detectChanges();

      expect(TestBed.inject(MemberClubSessionService).token()).toBe(SESSION_TOKEN);
      expect(api.getSelfSummary).toHaveBeenCalledOnce();
      const retry = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="member-home-retry"]'
      )!;
      expect(retry.textContent).toContain('Intentar de nuevo');

      retry.click();
      fixture.detectChanges();
      expect(api.getSelfSummary).toHaveBeenCalledTimes(2);
      expect(api.getSelfSummary).toHaveBeenLastCalledWith(SESSION_TOKEN);
    }
  );

  it('clears the session after successful logout', async () => {
    await configure({ access: ACCESS_A }, 'club');
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

  it('does not start a QR request while logout is pending', async () => {
    await configure({ access: ACCESS_A }, 'club');
    const pendingLogout = new Subject<void>();
    api.logout.mockReturnValue(pendingLogout);
    api.getQr.mockReturnValue(of({ identifier: '123e4567-e89b-42d3-a456-426614174000' }));
    const session = TestBed.inject(MemberClubSessionService);
    session.establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const qrToggle = element.querySelector<HTMLButtonElement>('[data-testid="member-qr-toggle"]')!;

    qrToggle.click();
    fixture.detectChanges();
    expect(api.getQr).toHaveBeenCalledOnce();
    expect(element.querySelector('[data-testid="member-qr-image"]')).toBeTruthy();

    element.querySelector<HTMLButtonElement>('[data-testid="member-logout"]')!.click();
    fixture.detectChanges();

    expect(api.logout).toHaveBeenCalledWith(SESSION_TOKEN);
    expect(session.token()).toBe(SESSION_TOKEN);
    expect(qrToggle.textContent).toContain('Ver mi QR');
    expect(qrToggle.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('[data-testid="member-qr-image"]')).toBeNull();

    qrToggle.click();
    fixture.detectChanges();

    expect(api.getQr).toHaveBeenCalledOnce();
    pendingLogout.error(new MemberClubApiError('network', 'temporary failure'));
    fixture.detectChanges();
    expect(session.token()).toBe(SESSION_TOKEN);
    expect(element.textContent).toContain(
      'No pudimos confirmar el cierre de sesión. Intenta nuevamente.'
    );

    qrToggle.click();
    fixture.detectChanges();
    expect(api.getQr).toHaveBeenCalledTimes(2);
  });

  it('does not let a stale successful logout clear a replacement session', async () => {
    await configure({ access: ACCESS_A }, 'club');
    const pendingLogout = new Subject<void>();
    api.logout.mockReturnValue(pendingLogout);
    api.getSelfSummary.mockReturnValueOnce(of(memberSummary(3))).mockReturnValueOnce(of(memberSummary(8)));
    const session = TestBed.inject(MemberClubSessionService);
    session.establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="member-logout"]')!.click();
    session.clear();
    session.establish(sessionResponseFor(ACCESS_B).session);
    fixture.detectChanges();
    pendingLogout.next();
    fixture.detectChanges();

    expect(session.token()).toBe(ACCESS_B);
    expect(fixture.nativeElement.textContent).toContain('8 sellos');
  });

  it('ignores a stale authentication-error logout callback', async () => {
    await configure({ access: ACCESS_A }, 'club');
    const pendingLogout = new Subject<void>();
    api.logout.mockReturnValue(pendingLogout);
    api.getSelfSummary.mockReturnValueOnce(of(memberSummary(3))).mockReturnValueOnce(of(memberSummary(8)));
    const session = TestBed.inject(MemberClubSessionService);
    session.establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="member-logout"]')!.click();
    session.clear();
    session.establish(sessionResponseFor(ACCESS_B).session);
    fixture.detectChanges();
    pendingLogout.error(new MemberClubApiError('authentication', 'stale'));
    fixture.detectChanges();

    expect(session.token()).toBe(ACCESS_B);
    expect(fixture.nativeElement.textContent).toContain('8 sellos');
    expect(fixture.nativeElement.textContent).not.toContain('Tu sesión del Club ya no está activa. Ingresa nuevamente.');
  });

  it('conceals the login NIP after a successful session and logout transition', async () => {
    await configure({ access: ACCESS_A }, 'club');
    api.login.mockReturnValue(of(sessionResponse()));
    api.logout.mockReturnValue(of(undefined));
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const loginInput = element.querySelector<HTMLInputElement>('[data-testid="member-login-pin"]')!;

    element.querySelector<HTMLButtonElement>('[data-testid="member-login-reveal"]')!.click();
    fixture.detectChanges();
    expect(loginInput.type).toBe('text');

    setInput(loginInput, '482731');
    submit(element);
    queryParams.next(convertToParamMap({ access: ACCESS_A }));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="member-club-home"]')).toBeTruthy();

    element.querySelector<HTMLButtonElement>('[data-testid="member-logout"]')!.click();
    fixture.detectChanges();

    expect(element.querySelector<HTMLInputElement>('[data-testid="member-login-pin"]')!.type).toBe(
      'password'
    );
    expect(
      element.querySelector<HTMLButtonElement>('[data-testid="member-login-reveal"]')!
        .getAttribute('aria-label')
    ).toBe('Mostrar NIP');
  });

  it.each(['network', 'server'] as const)(
    'retains the session after a %s logout failure and permits explicit retry',
    async (kind) => {
      await configure({ access: ACCESS_A }, 'club');
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

  it('loads calm member-safe history after summary and appends a later page once', async () => {
    await configure({ access: ACCESS_A }, 'club');
    api.getHistory
      .mockReturnValueOnce(of({
        items: [{ occurredAtISO: '2026-11-16T18:30:00.000Z', type: 'STAMP_EARNED', stampDelta: 1, stampCountAfter: 3 }],
        nextToken: 'opaque-next-page'
      }))
      .mockReturnValueOnce(of({
        items: [{ occurredAtISO: '2026-10-22T17:15:00.000Z', type: 'ADMIN_ADJUSTMENT', stampDelta: -1, stampCountAfter: 2 }]
      }));
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(api.getHistory).toHaveBeenCalledWith(SESSION_TOKEN, { limit: 5 });
    expect(element.querySelector('[data-testid="member-history"]')?.textContent).toContain('Sello ganado');
    expect(element.querySelector('[data-testid="member-history"]')?.textContent).toContain('+1 sello');
    expect(element.querySelector('[data-testid="member-history"]')?.textContent).toContain('16 nov 2026');
    const loadMore = element.querySelector<HTMLButtonElement>('[data-testid="member-history-load-more"]')!;
    loadMore.click();
    fixture.detectChanges();

    expect(api.getHistory).toHaveBeenLastCalledWith(SESSION_TOKEN, { limit: 5, nextToken: 'opaque-next-page' });
    expect(element.querySelector('[data-testid="member-history-list"]')?.querySelectorAll('li')).toHaveLength(2);
    expect(element.textContent).toContain('Ajuste de sellos');
    expect(element.textContent).toContain('-1 sello');
  });

  it('keeps progress while exposing a history-only recovery action', async () => {
    await configure({ access: ACCESS_A }, 'club');
    api.getHistory.mockReturnValue(throwError(() => new MemberClubApiError('server', 'safe')));
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="member-progress"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="member-history-error"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="member-history-retry"]')).toBeTruthy();
  });
  it('renders progress while history is pending and preserves identical movements across pages', async () => {
    await configure({ access: ACCESS_A }, 'club');
    const pending = new Subject<any>();
    const item = { occurredAtISO: '2026-11-16T18:30:00.000Z', type: 'STAMP_EARNED', stampDelta: 1, stampCountAfter: 3 };
    api.getHistory.mockReturnValueOnce(pending).mockReturnValueOnce(of({ items: [item] }));
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="member-progress"]')).toBeTruthy();
    pending.next({ items: [item], nextToken: 'opaque' });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-testid="member-history-load-more"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="member-history-list"] li')).toHaveLength(2);
  });

  it('retains movements on pagination failure and retries without duplicate requests', async () => {
    await configure({ access: ACCESS_A }, 'club');
    const pending = new Subject<any>();
    const item = { occurredAtISO: '2026-11-16T18:30:00.000Z', type: 'STAMP_EARNED', stampDelta: 1, stampCountAfter: 3 };
    api.getHistory.mockReturnValueOnce(of({ items: [item], nextToken: 'opaque' }))
      .mockReturnValueOnce(throwError(() => new MemberClubApiError('server', 'safe')))
      .mockReturnValueOnce(pending);
    TestBed.inject(MemberClubSessionService).establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    const button = () => fixture.nativeElement.querySelector('[data-testid="member-history-load-more"]') as HTMLButtonElement;
    button().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="member-history-list"] li')).toHaveLength(1);
    button().click();
    button().click();
    expect(api.getHistory).toHaveBeenCalledTimes(3);
    pending.next({ items: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="member-history-list"] li')).toHaveLength(1);
  });

  it('ignores history from a replaced session and clears history on logout', async () => {
    await configure({ access: ACCESS_A }, 'club');
    const oldHistory = new Subject<any>();
    const item = { occurredAtISO: '2026-11-16T18:30:00.000Z', type: 'STAMP_EARNED', stampDelta: 1, stampCountAfter: 3 };
    api.getHistory.mockReturnValueOnce(oldHistory).mockReturnValueOnce(of({ items: [item] }));
    api.logout.mockReturnValue(of({}));
    const session = TestBed.inject(MemberClubSessionService);
    session.establish(sessionResponse().session);
    const fixture = TestBed.createComponent(MemberClubAccessComponent);
    fixture.detectChanges();
    session.establish(sessionResponseFor(ACCESS_B).session);
    fixture.detectChanges();
    oldHistory.next({ items: [{ ...item, type: 'ADMIN_ADJUSTMENT' }] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Ajuste de sellos');
    expect(fixture.nativeElement.textContent).toContain('Sello ganado');
    fixture.nativeElement.querySelector('[data-testid="member-logout"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Sello ganado');
  });

});
