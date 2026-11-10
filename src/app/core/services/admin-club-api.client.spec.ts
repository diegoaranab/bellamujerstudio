import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { ClubClient, ClubVisit, LoyaltyBalance, LoyaltyLedgerEntry } from '../models';
import {
  AdminClubApiClient,
  AdminClubApiError,
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
});
