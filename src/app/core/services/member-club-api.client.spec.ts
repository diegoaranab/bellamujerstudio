import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import {
  MemberClubApiClient,
  MemberClubApiError,
  MemberClubApiErrorKind
} from './member-club-api.client';
import { CLUB_API_CONFIG } from './club-api-config';

const ACCESS = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const INVITATION = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
const SESSION = 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI';

describe('MemberClubApiClient', () => {
  let http: HttpTestingController;

  function configure(baseUrl = 'https://api.example.test/') {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CLUB_API_CONFIG, useValue: { baseUrl } }
      ]
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(MemberClubApiClient);
  }

  function futureISO(): string {
    return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }

  afterEach(() => {
    try {
      http?.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('enrolls with the exact public contract and no authorization header', async () => {
    const client = configure('https://api.example.test////');
    const promise = firstValueFrom(client.enroll(ACCESS, INVITATION, '482731'));

    const request = http.expectOne('https://api.example.test/club/access/enroll');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      accessHandle: ACCESS,
      invitationToken: INVITATION,
      pin: '482731'
    });
    expect(Object.keys(request.request.body as object)).toEqual([
      'accessHandle',
      'invitationToken',
      'pin'
    ]);
    expect(request.request.headers.has('Authorization')).toBe(false);
    const expiresAtISO = futureISO();
    request.flush({ session: { token: SESSION, expiresAtISO } });

    await expect(promise).resolves.toEqual({ session: { token: SESSION, expiresAtISO } });
  });

  it('logs in with exactly the access handle and PIN', async () => {
    const client = configure();
    const promise = firstValueFrom(client.login(ACCESS, '482731'));
    const request = http.expectOne('https://api.example.test/club/access/login');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ accessHandle: ACCESS, pin: '482731' });
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ session: { token: SESSION, expiresAtISO: futureISO() } });
    await expect(promise).resolves.toMatchObject({ session: { token: SESSION } });
  });

  it('supplies a validated bearer token for session probe and logout without putting it in URLs', async () => {
    const client = configure();
    const probePromise = firstValueFrom(client.checkSession(SESSION));
    const probe = http.expectOne('https://api.example.test/club/access/session');
    expect(probe.request.headers.get('Authorization')).toBe(`Bearer ${SESSION}`);
    expect(probe.request.urlWithParams).not.toContain(SESSION);
    probe.flush({ authenticated: true });
    await expect(probePromise).resolves.toEqual({ authenticated: true });

    const logoutPromise = firstValueFrom(client.logout(SESSION));
    const logout = http.expectOne('https://api.example.test/club/access/logout');
    expect(logout.request.headers.get('Authorization')).toBe(`Bearer ${SESSION}`);
    expect(logout.request.urlWithParams).not.toContain(SESSION);
    logout.flush(null, { status: 204, statusText: 'No Content' });
    await expect(logoutPromise).resolves.toBeNull();
  });

  it.each([
    [
      'CLUB_ACCESS_INVITATION_INVALID',
      'invitation',
      'Este enlace ya no es válido. Solicita uno nuevo en Bella Mujer Studio.'
    ],
    [
      'CLUB_PIN_INVALID',
      'validation',
      'Elige un NIP de seis dígitos que no sea común ni repetido.'
    ],
    [
      'CLUB_ACCESS_AUTHENTICATION_FAILED',
      'authentication',
      'No pudimos validar el acceso. Revisa tu NIP e intenta nuevamente.'
    ],
    [
      'CLUB_ACCESS_CONCURRENT_UPDATE',
      'conflict',
      'El acceso cambió mientras procesábamos la solicitud. Intenta nuevamente.'
    ]
  ])('maps reviewed backend code %s to safe owned copy', async (code, kind, message) => {
    const client = configure();
    const promise = firstValueFrom(client.login(ACCESS, '482731'));
    http.expectOne('https://api.example.test/club/access/login').flush(
      { error: code, message: 'arbitrary backend details must not appear' },
      { status: code === 'CLUB_ACCESS_AUTHENTICATION_FAILED' ? 401 : 400, statusText: 'Error' }
    );
    await expect(promise).rejects.toMatchObject({ kind, message });
  });

  it.each([
    [30, 30],
    [1, 1],
    [3600, 3600],
    [0, 60],
    [3601, 60],
    [1.5, 60],
    ['30', 60],
    [null, 60]
  ])('safely bounds a throttling retry value of %s', async (value, expected) => {
    const client = configure();
    const promise = firstValueFrom(client.login(ACCESS, '482731'));
    http.expectOne('https://api.example.test/club/access/login').flush(
      { error: 'CLUB_ACCESS_THROTTLED', retryAfterSeconds: value },
      { status: 429, statusText: 'Too Many Requests' }
    );
    await expect(promise).rejects.toMatchObject({
      kind: 'throttled',
      retryAfterSeconds: expected,
      message: `Espera ${expected} segundos antes de intentar nuevamente.`
    });
  });

  it('does not preserve arbitrary backend errors', async () => {
    const client = configure();
    const promise = firstValueFrom(client.login(ACCESS, '482731'));
    http.expectOne('https://api.example.test/club/access/login').flush(
      {
        error: 'AWS_INTERNAL_DETAIL',
        message: 'secret backend message',
        requestId: 'request-id',
        tableName: 'private-table'
      },
      { status: 500, statusText: 'Server Error' }
    );

    try {
      await promise;
      expect.fail('Expected a safe error');
    } catch (error) {
      expect(error).toMatchObject({
        kind: 'server',
        message: 'No fue posible procesar la solicitud del Club. Intenta de nuevo.'
      });
      expect(JSON.stringify(error)).not.toContain('secret backend message');
      expect(JSON.stringify(error)).not.toContain('request-id');
    }
  });

  it.each([
    ['invalid access handle', 'not-canonical', '482731'],
    ['padded access handle', `${ACCESS}=`, '482731'],
    ['short PIN', ACCESS, '12345'],
    ['non-numeric PIN', ACCESS, '12a456']
  ])('rejects %s locally without an HTTP request', async (_label, handle, pin) => {
    const client = configure();
    await expect(firstValueFrom(client.login(handle, pin))).rejects.toBeInstanceOf(
      MemberClubApiError
    );
    http.expectNone('https://api.example.test/club/access/login');
  });

  it('rejects a non-canonical invitation locally', async () => {
    const client = configure();
    await expect(firstValueFrom(client.enroll(ACCESS, 'not-canonical', '482731'))).rejects.toMatchObject({
      kind: 'invitation'
    });
    http.expectNone('https://api.example.test/club/access/enroll');
  });

  it.each([
    ['non-canonical session token', 'raw-session-token', futureISO()],
    ['invalid expiry', SESSION, 'not-a-date'],
    ['expired session', SESSION, new Date(Date.now() - 1000).toISOString()],
    ['non-canonical ISO expiry', SESSION, new Date(Date.now() + 60_000).toUTCString()]
  ])('rejects a successful response with %s', async (_label, token, expiresAtISO) => {
    const client = configure();
    const promise = firstValueFrom(client.login(ACCESS, '482731'));
    http.expectOne('https://api.example.test/club/access/login').flush({
      session: { token, expiresAtISO }
    });
    await expect(promise).rejects.toMatchObject({ kind: 'server' });
  });

  it('rejects malformed probe responses safely', async () => {
    const client = configure();
    const promise = firstValueFrom(client.checkSession(SESSION));
    http.expectOne('https://api.example.test/club/access/session').flush({ authenticated: false });
    await expect(promise).rejects.toMatchObject({ kind: 'server' });
  });

  it('reports configuration and network failures with safe kinds', async () => {
    const unconfigured = configure('   ');
    await expect(firstValueFrom(unconfigured.login(ACCESS, '482731'))).rejects.toMatchObject({
      kind: 'configuration' satisfies MemberClubApiErrorKind
    });
    TestBed.resetTestingModule();

    const client = configure();
    const promise = firstValueFrom(client.login(ACCESS, '482731'));
    http.expectOne('https://api.example.test/club/access/login').error(new ProgressEvent('offline'));
    await expect(promise).rejects.toMatchObject({ kind: 'network' });
  });
});
