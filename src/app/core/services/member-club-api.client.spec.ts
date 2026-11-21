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

  it.each([0, 1, 7])('reads a valid member self-summary with %s stamps', async (stampCount) => {
    const client = configure();
    const promise = firstValueFrom(client.getSelfSummary(SESSION));
    const request = http.expectOne('https://api.example.test/club/me');

    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${SESSION}`);
    expect(request.request.urlWithParams).not.toContain(SESSION);
    request.flush({
      profile: { name: ' Mariana Prueba ' },
      loyalty: { stampCount },
      ignoredServerField: 'not projected'
    });

    await expect(promise).resolves.toEqual({
      profile: { name: 'Mariana Prueba' },
      loyalty: { stampCount }
    });
  });

  it('reads and safely projects paginated member history with bearer authorization', async () => {
    const client = configure();
    const opaqueToken = 'opaque cursor + / = value';
    const promise = firstValueFrom(client.getHistory(SESSION, { limit: 5, nextToken: opaqueToken }));
    const request = http.expectOne((candidate) => candidate.url === 'https://api.example.test/club/me/history');

    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${SESSION}`);
    expect(request.request.urlWithParams).not.toContain(SESSION);
    expect(request.request.params.get('limit')).toBe('5');
    expect(request.request.params.get('nextToken')).toBe(opaqueToken);
    request.flush({
      items: [{
        occurredAtISO: '2026-11-16T18:30:00.000Z',
        type: 'STAMP_EARNED',
        stampDelta: 1,
        stampCountAfter: 3,
        studioId: 'must-not-be-projected'
      }],
      nextToken: 'next-page-token',
      clientId: 'must-not-be-projected'
    });

    await expect(promise).resolves.toEqual({
      items: [{
        occurredAtISO: '2026-11-16T18:30:00.000Z',
        type: 'STAMP_EARNED',
        stampDelta: 1,
        stampCountAfter: 3
      }],
      nextToken: 'next-page-token'
    });
  });

  it('rejects unapproved promotion server metadata', async () => {
    const client = configure();
    const promise = firstValueFrom(client.getPromotion(SESSION));
    const request = http.expectOne('https://api.example.test/club/me/promotions');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${SESSION}`);
    expect(request.request.urlWithParams).not.toContain(SESSION);
    request.flush({ promotion: {
      title: '  Beneficio de prueba  ',
      description: 'Descripción\ncon línea',
      startsAtISO: '2026-11-01T15:00:00.000Z',
      endsAtISO: '2026-12-01T15:00:00.000Z',
      promotionId: 'must not project'
    } });
    await expect(promise).rejects.toMatchObject({ kind: 'server' });
  });

  it('accepts null and projects a valid promotion without server metadata', async () => {
    const client = configure();
    const empty = firstValueFrom(client.getPromotion(SESSION));
    http.expectOne('https://api.example.test/club/me/promotions').flush({ promotion: null });
    await expect(empty).resolves.toBeNull();

    const active = firstValueFrom(client.getPromotion(SESSION));
    http.expectOne('https://api.example.test/club/me/promotions').flush({ promotion: {
      title: '  Beneficio de prueba  ',
      description: 'Descripción\ncon línea',
      startsAtISO: '2026-11-01T15:00:00.000Z',
      endsAtISO: '2026-12-01T15:00:00.000Z'
    } });
    await expect(active).resolves.toEqual({
      title: 'Beneficio de prueba',
      description: 'Descripción\ncon línea',
      startsAtISO: '2026-11-01T15:00:00.000Z',
      endsAtISO: '2026-12-01T15:00:00.000Z'
    });
  });

  it.each([
    { promotion: null, extra: true },
    { promotion: { title: 'T', description: 'D', startsAtISO: '2026-11-01T15:00:00.000Z', endsAtISO: '2026-12-01T15:00:00.000Z', extra: true } },
    { promotion: { title: 'T', description: 'D', startsAtISO: '2026-11-01T15:00:00.000Z' } },
    { promotion: { title: ' ', description: 'D', startsAtISO: '2026-11-01T15:00:00.000Z', endsAtISO: '2026-12-01T15:00:00.000Z' } },
    { promotion: { title: 'T', description: '  ', startsAtISO: '2026-11-01T15:00:00.000Z', endsAtISO: '2026-12-01T15:00:00.000Z' } },
    { promotion: { title: 'T\nT', description: 'D', startsAtISO: '2026-11-01T15:00:00.000Z', endsAtISO: '2026-12-01T15:00:00.000Z' } },
    { promotion: { title: 'T', description: 'D\rD', startsAtISO: '2026-11-01T15:00:00.000Z', endsAtISO: '2026-12-01T15:00:00.000Z' } },
    { promotion: { title: 'T', description: 'D', startsAtISO: '2026-02-30T15:00:00.000Z', endsAtISO: '2026-12-01T15:00:00.000Z' } },
    { promotion: { title: 'T', description: 'D', startsAtISO: '2026-11-01T15:00:00Z', endsAtISO: '2026-12-01T15:00:00.000Z' } },
    { promotion: { title: 'T', description: 'D', startsAtISO: '2026-12-01T15:00:00.000Z', endsAtISO: '2026-12-01T15:00:00.000Z' } }
  ])('rejects malformed promotion envelopes safely', async (body) => {
    const client = configure();
    const promise = firstValueFrom(client.getPromotion(SESSION));
    http.expectOne('https://api.example.test/club/me/promotions').flush(body);
    await expect(promise).rejects.toMatchObject({ kind: 'server' });
  });

  it.each([[401, 'authentication'], [403, 'authentication'], [500, 'server'], [0, 'network']] as const)(
    'normalizes promotion HTTP %s errors without backend detail', async (status, kind) => {
      const client = configure();
      const promise = firstValueFrom(client.getPromotion(SESSION));
      const request = http.expectOne('https://api.example.test/club/me/promotions');
      if (status === 0) request.error(new ProgressEvent('offline'));
      else request.flush({ message: 'private server detail' }, { status, statusText: 'failure' });
      await expect(promise).rejects.toMatchObject({ kind });
      try { await promise; } catch (error) {
        expect(JSON.stringify(error)).not.toContain('private server detail');
      }
    }
  );

  it('reads only the canonical QR UUID using the member bearer session', async () => {
    const client = configure();
    const promise = firstValueFrom(client.getQr(SESSION));
    const request = http.expectOne('https://api.example.test/club/me/qr');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${SESSION}`);
    expect(request.request.urlWithParams).not.toContain(SESSION);
    request.flush({ qr: { identifier: '123e4567-e89b-42d3-a456-426614174000' } });
    await expect(promise).resolves.toEqual({ identifier: '123e4567-e89b-42d3-a456-426614174000' });
  });

  it.each([
    {},
    { qr: {} },
    { qr: { identifier: '123E4567-e89b-42d3-a456-426614174000' } },
    { qr: { identifier: '123e4567-e89b-12d3-a456-426614174000' } },
    { qr: { identifier: 'bad' } },
    { qr: { identifier: '123e4567-e89b-42d3-a456-426614174000', extra: true } },
    { qr: { identifier: '123e4567-e89b-42d3-a456-426614174000' }, extra: true }
  ])('rejects malformed QR response safely', async (body) => {
    const client = configure();
    const promise = firstValueFrom(client.getQr(SESSION));
    http.expectOne('https://api.example.test/club/me/qr').flush(body);
    await expect(promise).rejects.toMatchObject({ kind: 'server' });
  });

  it.each([[401, 'authentication'], [403, 'authentication'], [500, 'server'], [0, 'network']] as const)(
    'normalizes QR HTTP %s errors without backend detail', async (status, kind) => {
      const client = configure();
      const promise = firstValueFrom(client.getQr(SESSION));
      const request = http.expectOne('https://api.example.test/club/me/qr');
      if (status === 0) request.error(new ProgressEvent('error'));
      else request.flush({ message: 'private detail' }, { status, statusText: 'failure' });
      await expect(promise).rejects.toMatchObject({ kind });
    }
  );

  it('rejects malformed member history without exposing a partial response', async () => {
    const client = configure();
    const promise = firstValueFrom(client.getHistory(SESSION));
    const request = http.expectOne((candidate) => candidate.url === 'https://api.example.test/club/me/history');
    expect(request.request.params.get('limit')).toBe('5');
    request.flush({ items: [{ type: 'STAMP_EARNED' }] });
    await expect(promise).rejects.toMatchObject({ kind: 'server' });
  });

  it.each([
    { items: [], nextToken: '' },
    { items: [], nextToken: 'x'.repeat(2049) },
    { items: [{ occurredAtISO: '2026-02-30T00:00:00.000Z', type: 'STAMP_EARNED', stampDelta: 1, stampCountAfter: 1 }] },
    { items: [{ occurredAtISO: '2026-11-16T18:30:00.000Z', type: 'UNKNOWN', stampDelta: 1, stampCountAfter: 1 }] },
    { items: [{ occurredAtISO: '2026-11-16T18:30:00.000Z', type: 'STAMP_EARNED', stampDelta: 0.5, stampCountAfter: 1 }] },
    { items: [{ occurredAtISO: '2026-11-16T18:30:00.000Z', type: 'STAMP_EARNED', stampDelta: 1, stampCountAfter: -1 }] }
  ])('rejects invalid history pages', async (body) => {
    const client = configure();
    const promise = firstValueFrom(client.getHistory(SESSION));
    http.expectOne((request) => request.url.endsWith('/club/me/history')).flush(body);
    await expect(promise).rejects.toMatchObject({ kind: 'server' });
  });

  it('accepts an empty history page and rejects invalid local credentials without a request', async () => {
    const client = configure();
    const promise = firstValueFrom(client.getHistory(SESSION, { limit: 9 }));
    const request = http.expectOne((candidate) => candidate.url.endsWith('/club/me/history'));
    expect(request.request.params.get('limit')).toBe('9');
    request.flush({ items: [] });
    await expect(promise).resolves.toEqual({ items: [] });
    await expect(firstValueFrom(client.getHistory('invalid'))).rejects.toMatchObject({ kind: 'authentication' });
    http.expectNone((candidate) => candidate.url.endsWith('/club/me/history'));
  });

  it.each([[401, 'authentication'], [403, 'authentication'], [500, 'server'], [0, 'network']])(
    'normalizes history HTTP %s errors', async (status, kind) => {
      const client = configure();
      const promise = firstValueFrom(client.getHistory(SESSION));
      const request = http.expectOne((candidate) => candidate.url.endsWith('/club/me/history'));
      if (status === 0) request.error(new ProgressEvent('error'));
      else request.flush({ message: 'private' }, { status, statusText: 'failure' });
      await expect(promise).rejects.toMatchObject({ kind });
    }
  );

  it.each([
    [{ profile: { name: '' }, loyalty: { stampCount: 0 } }],
    [{ profile: { name: '   ' }, loyalty: { stampCount: 0 } }],
    [{ profile: { name: 'Mariana' }, loyalty: { stampCount: -1 } }],
    [{ profile: { name: 'Mariana' }, loyalty: { stampCount: 1.5 } }],
    [{ profile: { name: 'Mariana' }, loyalty: { stampCount: Number.MAX_SAFE_INTEGER + 1 } }]
  ])('rejects malformed member self-summary data safely', async (body) => {
    const client = configure();
    const promise = firstValueFrom(client.getSelfSummary(SESSION));
    http.expectOne('https://api.example.test/club/me').flush(body);

    await expect(promise).rejects.toMatchObject({
      kind: 'server',
      message: 'No fue posible procesar la solicitud del Club. Intenta de nuevo.'
    });
  });

  it('normalizes member self-summary authentication and network failures safely', async () => {
    const client = configure();
    const authentication = firstValueFrom(client.getSelfSummary(SESSION));
    http.expectOne('https://api.example.test/club/me').flush(
      { error: 'untrusted detail' },
      { status: 401, statusText: 'Unauthorized' }
    );
    await expect(authentication).rejects.toMatchObject({ kind: 'authentication' });

    const network = firstValueFrom(client.getSelfSummary(SESSION));
    http.expectOne('https://api.example.test/club/me').error(new ProgressEvent('offline'));
    await expect(network).rejects.toMatchObject({
      kind: 'network',
      message: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
    });
  });

  it('rejects an invalid local session token before requesting member self-summary', async () => {
    const client = configure();
    await expect(firstValueFrom(client.getSelfSummary('not-a-token'))).rejects.toMatchObject({
      kind: 'authentication'
    });
    http.expectNone('https://api.example.test/club/me');
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
