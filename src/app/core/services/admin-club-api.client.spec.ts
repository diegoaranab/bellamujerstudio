import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { ClubClient, ClubVisit, LoyaltyBalance, LoyaltyLedgerEntry } from '../models';
import {
  AdminClubAccessMutationResponse,
  AdminClubAccessSummary,
  AdminClubApiClient,
  AdminClubApiError,
  AdminClubPromotion,
  AdminClubPromotionCreateRequest,
  AdminClubVisitCreateRequest
} from './admin-club-api.client';
import { CLUB_API_CONFIG } from './club-api-config';

const clubClient: ClubClient = {
  studioId: 'bella-mujer',
  clientId: 'client-1',
  name: 'Ana López',
  phone: '2381110000',
  status: 'active',
  createdAtISO: '2026-11-08T12:00:00.000Z',
  updatedAtISO: '2026-11-08T12:00:00.000Z'
};

const balance: LoyaltyBalance = {
  studioId: 'bella-mujer',
  clientId: 'client-1',
  stampCount: 2,
  eligibleSpendCarryMXN: 350,
  version: 3,
  updatedAtISO: '2026-11-08T12:30:00.000Z'
};

const visit: ClubVisit = {
  studioId: 'bella-mujer',
  clientId: 'client-1',
  visitId: 'visit-1',
  occurredAtISO: '2026-11-08T12:15:00.000Z',
  amountMXN: 800,
  eligibleAmountMXN: 700,
  serviceIds: ['service-1'],
  source: 'admin',
  createdByAdminSub: 'admin-sub',
  createdAtISO: '2026-11-08T12:30:00.000Z'
};

const ledgerEntry: LoyaltyLedgerEntry = {
  studioId: 'bella-mujer',
  clientId: 'client-1',
  entryId: 'entry-1',
  type: 'ELIGIBLE_SPEND_ADDED',
  occurredAtISO: '2026-11-08T12:15:00.000Z',
  createdAtISO: '2026-11-08T12:30:00.000Z',
  stampDelta: 0,
  eligibleSpendDeltaMXN: 700,
  stampCountAfter: 2,
  eligibleSpendCarryAfterMXN: 350,
  createdByAdminSub: 'admin-sub',
  visitId: 'visit-1'
};

const accessSummary: AdminClubAccessSummary = {
  status: 'invited',
  credentialVersion: 2,
  invitationGeneration: 3,
  hasPin: false,
  updatedAtISO: '2026-11-10T12:00:00.000Z'
};

const accessMutationResponse: AdminClubAccessMutationResponse = {
  access: accessSummary,
  invitation: {
    activationFragment: '#/club/activar?access=opaque-handle&invite=one-time-token',
    expiresAtISO: '2026-11-11T12:00:00.000Z'
  }
};

const promotion: AdminClubPromotion = {
  promotionId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Promoción de noviembre',
  description: 'Un detalle especial',
  status: 'active',
  startsAtISO: '2026-11-01T06:00:00.000Z',
  endsAtISO: '2026-12-01T06:00:00.000Z',
  createdAtISO: '2026-10-20T12:00:00.000Z',
  updatedAtISO: '2026-10-20T12:00:00.000Z'
};

describe('AdminClubApiClient', () => {
  let http: HttpTestingController;
  let getAccessToken: ReturnType<typeof vi.fn>;
  let getToken: ReturnType<typeof vi.fn>;

  function configure(baseUrl = 'https://api.example.test/') {
    getAccessToken = vi.fn().mockResolvedValue('access-token');
    getToken = vi.fn().mockResolvedValue('id-token');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getAccessToken, getToken } },
        { provide: CLUB_API_CONFIG, useValue: { baseUrl } }
      ]
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AdminClubApiClient);
  }

  afterEach(() => {
    try {
      http?.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('lists the first client page with the access token and default limit', async () => {
    const client = configure();
    const promise = firstValueFrom(client.listClients());
    await Promise.resolve();

    const request = http.expectOne(
      (candidate) =>
        candidate.url === 'https://api.example.test/admin/club/clients' &&
        candidate.params.get('limit') === '50'
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.params.has('nextToken')).toBe(false);
    expect(request.request.urlWithParams).not.toContain('access-token');
    request.flush({ items: [clubClient], nextToken: 'opaque-next' });

    await expect(promise).resolves.toEqual({ items: [clubClient], nextToken: 'opaque-next' });
    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(getToken).not.toHaveBeenCalled();
  });

  it('lists clients with an explicit bounded limit and opaque pagination token', async () => {
    const client = configure('https://api.example.test////');
    const promise = firstValueFrom(client.listClients(100, 'opaque+/= token'));
    await Promise.resolve();

    const request = http.expectOne(
      (candidate) =>
        candidate.url === 'https://api.example.test/admin/club/clients' &&
        candidate.params.get('limit') === '100' &&
        candidate.params.get('nextToken') === 'opaque+/= token'
    );
    request.flush({ items: [] });

    await expect(promise).resolves.toEqual({ items: [] });
  });

  it('gets a client through an encoded URL with the access token', async () => {
    const client = configure();
    const promise = firstValueFrom(client.getClient('client/id +?á'));
    await Promise.resolve();

    const request = http.expectOne(
      'https://api.example.test/admin/club/clients/client%2Fid%20%2B%3F%C3%A1'
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.urlWithParams).not.toContain('access-token');
    request.flush({ client: clubClient, balance });

    await expect(promise).resolves.toEqual({ client: clubClient, balance });
  });

  it('creates a client with exactly the supported body and the access token', async () => {
    const client = configure();
    const promise = firstValueFrom(client.createClient({ name: 'Ana López', phone: '2381110000' }));
    await Promise.resolve();

    const request = http.expectOne('https://api.example.test/admin/club/clients');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Ana López', phone: '2381110000' });
    expect(Object.keys(request.request.body as object)).toEqual(['name', 'phone']);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    request.flush({ client: clubClient, balance });

    await expect(promise).resolves.toEqual({ client: clubClient, balance });
  });

  it('registers a visit with the exact caller-supplied idempotency key and contract body', async () => {
    const client = configure();
    const body: AdminClubVisitCreateRequest = {
      occurredAtISO: '2026-11-08T12:15:00.000Z',
      amountMXN: 800,
      eligibleAmountMXN: 700,
      serviceIds: ['service-1']
    };
    const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
    const promise = firstValueFrom(client.registerVisit('client/id +?á', body, idempotencyKey));
    await Promise.resolve();

    const request = http.expectOne(
      'https://api.example.test/admin/club/clients/client%2Fid%20%2B%3F%C3%A1/visits'
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    expect(Object.keys(request.request.body as object)).toEqual([
      'occurredAtISO',
      'amountMXN',
      'eligibleAmountMXN',
      'serviceIds'
    ]);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.headers.get('Idempotency-Key')).toBe(idempotencyKey);
    expect(request.request.urlWithParams).not.toContain('access-token');
    expect(request.request.urlWithParams).not.toContain(idempotencyKey);
    const response = {
      visit,
      loyalty: {
        stampsAwarded: 0 as const,
        stampCountAfter: 2,
        eligibleSpendCarryAfterMXN: 350
      },
      balance,
      replayed: false
    };
    request.flush(response);

    await expect(promise).resolves.toEqual(response);
  });

  it('lists encoded client ledger entries with bounded opaque pagination', async () => {
    const client = configure();
    const promise = firstValueFrom(client.listLedgerEntries('client/id +?á', 25, 'opaque+/= token'));
    await Promise.resolve();

    const request = http.expectOne(
      (candidate) =>
        candidate.url ===
          'https://api.example.test/admin/club/clients/client%2Fid%20%2B%3F%C3%A1/ledger' &&
        candidate.params.get('limit') === '25' &&
        candidate.params.get('nextToken') === 'opaque+/= token'
    );
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    request.flush({ items: [ledgerEntry], nextToken: 'another-token' });

    await expect(promise).resolves.toEqual({
      items: [ledgerEntry],
      nextToken: 'another-token'
    });
  });

  it.each([
    ['a null access state', null],
    ['an existing typed access state', accessSummary]
  ])('gets encoded client access with the access token and preserves %s', async (_label, access) => {
    const client = configure();
    const promise = firstValueFrom(client.getClientAccess('client/id +?á'));
    await Promise.resolve();

    const request = http.expectOne(
      'https://api.example.test/admin/club/clients/client%2Fid%20%2B%3F%C3%A1/access'
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.urlWithParams).not.toContain('access-token');
    request.flush({ access });

    await expect(promise).resolves.toEqual({ access });
    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(getToken).not.toHaveBeenCalled();
  });

  it('generates an invitation at the encoded URL with no request body', async () => {
    const client = configure();
    const promise = firstValueFrom(client.generateClientAccessInvitation('client/id +?á'));
    await Promise.resolve();

    const request = http.expectOne(
      'https://api.example.test/admin/club/clients/client%2Fid%20%2B%3F%C3%A1/access/invitation'
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.urlWithParams).not.toContain('access-token');
    request.flush(accessMutationResponse);

    await expect(promise).resolves.toEqual(accessMutationResponse);
    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(getToken).not.toHaveBeenCalled();
  });

  it('resets access at the encoded URL with no request body and no ID-token fallback', async () => {
    const client = configure();
    const promise = firstValueFrom(client.resetClientAccess('client/id +?á'));
    await Promise.resolve();

    const request = http.expectOne(
      'https://api.example.test/admin/club/clients/client%2Fid%20%2B%3F%C3%A1/access/reset'
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    request.flush(accessMutationResponse);

    await expect(promise).resolves.toEqual(accessMutationResponse);
    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(getToken).not.toHaveBeenCalled();
  });

  it('does not fall back to an ID token for access lifecycle requests', async () => {
    const client = configure();
    getAccessToken.mockResolvedValue(null);

    await expect(
      firstValueFrom(client.generateClientAccessInvitation(clubClient.clientId))
    ).rejects.toMatchObject({ kind: 'authentication' });
    await expect(
      firstValueFrom(client.resetClientAccess(clubClient.clientId))
    ).rejects.toMatchObject({ kind: 'authentication' });
    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(getToken).not.toHaveBeenCalled();
    http.expectNone(
      `https://api.example.test/admin/club/clients/${clubClient.clientId}/access/invitation`
    );
    http.expectNone(
      `https://api.example.test/admin/club/clients/${clubClient.clientId}/access/reset`
    );
  });

  it('rejects an unbounded limit without making an HTTP request', async () => {
    const client = configure();

    await expect(firstValueFrom(client.listClients(101))).rejects.toMatchObject({
      kind: 'validation'
    });
    http.expectNone('https://api.example.test/admin/club/clients');
  });

  it('fails locally without an access token and never falls back to an ID token', async () => {
    const client = configure();
    getAccessToken.mockResolvedValue(null);

    await expect(firstValueFrom(client.getClient(clubClient.clientId))).rejects.toMatchObject({
      kind: 'authentication'
    });
    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(getToken).not.toHaveBeenCalled();
    http.expectNone(`https://api.example.test/admin/club/clients/${clubClient.clientId}`);
  });

  it('fails locally when the API base URL is empty', async () => {
    const client = configure('   ');

    expect(client.isConfigured).toBe(false);
    await expect(firstValueFrom(client.listClients())).rejects.toMatchObject({
      kind: 'configuration'
    });
    expect(getAccessToken).not.toHaveBeenCalled();
    http.expectNone('/admin/club/clients');
  });

  it.each([
    [400, 'validation'],
    [401, 'authentication'],
    [403, 'authentication'],
    [404, 'not-found'],
    [409, 'conflict'],
    [0, 'network'],
    [500, 'server']
  ] as const)('normalizes HTTP %i as a safe %s failure', async (status, kind) => {
    const client = configure();
    const promise = firstValueFrom(client.getClient(clubClient.clientId));
    await Promise.resolve();

    http.expectOne(`https://api.example.test/admin/club/clients/${clubClient.clientId}`).flush(
      { message: 'sensitive backend detail', token: 'must-not-leak', awsRequestId: 'secret' },
      { status, statusText: 'Error' }
    );

    await expect(promise).rejects.toMatchObject({ kind });
    await expect(promise).rejects.toBeInstanceOf(AdminClubApiError);
    await expect(promise).rejects.not.toMatchObject({
      message: expect.stringContaining('sensitive backend detail')
    });
    await expect(promise).rejects.not.toMatchObject({
      message: expect.stringContaining('secret')
    });
  });

  it('lists promotions without query parameters and validates an empty catalog', async () => {
    const client = configure();
    const promise = firstValueFrom(client.listPromotions());
    await Promise.resolve();
    const request = http.expectOne('https://api.example.test/admin/club/promotions');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    request.flush({ items: [] });
    await expect(promise).resolves.toEqual({ items: [] });
    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(getToken).not.toHaveBeenCalled();
  });

  it('preserves promotion list order and rejects top-level or private extra fields safely', async () => {
    const client = configure();
    const promise = firstValueFrom(client.listPromotions());
    await Promise.resolve();
    http.expectOne('https://api.example.test/admin/club/promotions').flush({ items: [promotion, { ...promotion, promotionId: '00000000-0000-4000-8000-000000000001' }] });
    await expect(promise).resolves.toEqual({ items: [promotion, { ...promotion, promotionId: '00000000-0000-4000-8000-000000000001' }] });

    const bad = firstValueFrom(client.listPromotions());
    await Promise.resolve();
    http.expectOne('https://api.example.test/admin/club/promotions').flush({ items: [{ ...promotion, studioId: 'private' }] });
    await expect(bad).rejects.toMatchObject({ kind: 'server', code: undefined, message: expect.not.stringContaining('private') });
  });

  it.each([
    ['uppercase UUID', { ...promotion, promotionId: promotion.promotionId.toUpperCase() }],
    ['invalid status', { ...promotion, status: 'paused' }],
    ['noncanonical timestamp', { ...promotion, startsAtISO: '2026-11-01T06:00:00Z' }],
    ['invalid interval', { ...promotion, startsAtISO: promotion.endsAtISO }],
    ['extra canonical field', { ...promotion, pk: 'private' }]
  ])('rejects a %s as a safe server error', async (_label, item) => {
    const client = configure();
    const promise = firstValueFrom(client.getPromotion(promotion.promotionId));
    await Promise.resolve();
    http.expectOne(`https://api.example.test/admin/club/promotions/${promotion.promotionId}`).flush({ promotion: item });
    await expect(promise).rejects.toMatchObject({ kind: 'server' });
  });

  it('gets a promotion with an encoded path and accepts the exact DTO', async () => {
    const client = configure();
    const promise = firstValueFrom(client.getPromotion('id/a +?'));
    await Promise.resolve();
    const request = http.expectOne('https://api.example.test/admin/club/promotions/id%2Fa%20%2B%3F');
    expect(request.request.method).toBe('GET');
    request.flush({ promotion });
    await expect(promise).resolves.toEqual({ promotion });
  });

  it.each([false, true])('creates a promotion and accepts replayed=%s', async (replayed) => {
    const client = configure();
    const body: AdminClubPromotionCreateRequest = { title: 'Título', description: 'Descripción', status: 'inactive', startsAtLocal: '2026-11-01T09:00', endsAtLocal: '2026-12-01T09:00' };
    const key = 'opaque-idempotency-key';
    const promise = firstValueFrom(client.createPromotion(body, key));
    await Promise.resolve();
    const request = http.expectOne('https://api.example.test/admin/club/promotions');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    expect(Object.keys(request.request.body)).toEqual(['title', 'description', 'status', 'startsAtLocal', 'endsAtLocal']);
    expect(request.request.headers.get('Idempotency-Key')).toBe(key);
    expect(request.request.urlWithParams).not.toContain(key);
    expect(JSON.stringify(request.request.body)).not.toContain(key);
    request.flush({ promotion, replayed }, { status: replayed ? 200 : 201, statusText: 'OK' });
    await expect(promise).resolves.toEqual({ promotion, replayed });
  });

  it('sends PATCH with only supplied optional fields and an encoded ID', async () => {
    const client = configure();
    const promise = firstValueFrom(client.updatePromotion('id/a', { expectedUpdatedAtISO: promotion.updatedAtISO, title: 'Actualizada', description: undefined, status: undefined }));
    await Promise.resolve();
    const request = http.expectOne('https://api.example.test/admin/club/promotions/id%2Fa');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ expectedUpdatedAtISO: promotion.updatedAtISO, title: 'Actualizada' });
    expect(Object.keys(request.request.body)).toEqual(['expectedUpdatedAtISO', 'title']);
    request.flush({ promotion });
    await expect(promise).resolves.toEqual({ promotion });
  });

  it('omits undefined and null optional PATCH properties', async () => {
    const client = configure();
    const promise = firstValueFrom(client.updatePromotion(promotion.promotionId, {
      expectedUpdatedAtISO: promotion.updatedAtISO,
      title: null as unknown as string,
      description: undefined
    }));
    await Promise.resolve();
    const request = http.expectOne(`https://api.example.test/admin/club/promotions/${promotion.promotionId}`);
    expect(request.request.body).toEqual({ expectedUpdatedAtISO: promotion.updatedAtISO });
    request.flush({ promotion });
    await expect(promise).resolves.toEqual({ promotion });
  });

  it('sends DELETE with the exact JSON body and validates its response', async () => {
    const client = configure();
    const promise = firstValueFrom(client.deletePromotion('id/a', { expectedUpdatedAtISO: promotion.updatedAtISO }));
    await Promise.resolve();
    const request = http.expectOne('https://api.example.test/admin/club/promotions/id%2Fa');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ expectedUpdatedAtISO: promotion.updatedAtISO });
    request.flush({ deleted: true, promotionId: promotion.promotionId });
    await expect(promise).resolves.toEqual({ deleted: true, promotionId: promotion.promotionId });
  });

  it('rejects an invalid DELETE response', async () => {
    const client = configure();
    const promise = firstValueFrom(client.deletePromotion(promotion.promotionId, { expectedUpdatedAtISO: promotion.updatedAtISO }));
    await Promise.resolve();
    http.expectOne(`https://api.example.test/admin/club/promotions/${promotion.promotionId}`).flush({ deleted: false, promotionId: promotion.promotionId });
    await expect(promise).rejects.toMatchObject({ kind: 'server' });
  });

  it.each([
    [400, 'VALIDATION_ERROR', 'validation'],
    [404, 'PROMOTION_NOT_FOUND', 'not-found'],
    [409, 'PROMOTION_CONFLICT', 'conflict'],
    [409, 'PROMOTION_CATALOG_FULL', 'conflict'],
    [409, 'IDEMPOTENCY_CONFLICT', 'conflict']
  ] as const)('maps safe promotion error %s %s', async (status, code, kind) => {
    const client = configure();
    const promise = firstValueFrom(client.listPromotions());
    await Promise.resolve();
    http.expectOne('https://api.example.test/admin/club/promotions').flush({ error: code, message: 'secret backend message' }, { status, statusText: 'Error' });
    await expect(promise).rejects.toMatchObject({ kind, code });
    await expect(promise).rejects.not.toMatchObject({ message: expect.stringContaining('secret backend message') });
  });

  it('does not preserve unknown promotion error codes or backend messages', async () => {
    const client = configure();
    const promise = firstValueFrom(client.listPromotions());
    await Promise.resolve();
    http.expectOne('https://api.example.test/admin/club/promotions').flush({ error: 'DB_FAILURE_SECRET', message: 'private details' }, { status: 409, statusText: 'Error' });
    await expect(promise).rejects.toMatchObject({ kind: 'conflict', code: undefined });
    await expect(promise).rejects.not.toMatchObject({ message: expect.stringContaining('private details') });
  });

  it.each(['', '   '])('rejects empty idempotency key before HTTP', async (key) => {
    const client = configure();
    await expect(firstValueFrom(client.createPromotion({ title: 'a', description: 'b', status: 'active', startsAtLocal: 'x', endsAtLocal: 'y' }, key))).rejects.toMatchObject({ kind: 'validation' });
    http.expectNone('https://api.example.test/admin/club/promotions');
  });

  it('rejects empty IDs and missing expected timestamps before HTTP', async () => {
    const client = configure();
    await expect(firstValueFrom(client.getPromotion(''))).rejects.toMatchObject({ kind: 'validation' });
    await expect(firstValueFrom(client.updatePromotion('', { expectedUpdatedAtISO: promotion.updatedAtISO }))).rejects.toMatchObject({ kind: 'validation' });
    await expect(firstValueFrom(client.deletePromotion(promotion.promotionId, {} as { expectedUpdatedAtISO: string }))).rejects.toMatchObject({ kind: 'validation' });
    http.expectNone('https://api.example.test/admin/club/promotions');
  });
});
