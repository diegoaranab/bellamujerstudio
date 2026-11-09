import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { GiftCard } from '../models';
import {
  AdminGiftCardApiClient,
  AdminGiftCardApiError
} from './admin-gift-card-api.client';
import { GIFT_CARD_API_CONFIG } from './gift-card-api-config';

const giftCard: GiftCard = {
  id: 'remote-1',
  folio: 'BM-ONLINE-1',
  createdAtISO: '2026-11-08T12:00:00.000Z',
  buyerName: 'Ana',
  buyerPhone: '2381110000',
  recipientName: 'Lupita',
  amountMXN: 800,
  paymentMethod: 'transferencia',
  status: 'pendiente'
};

describe('AdminGiftCardApiClient', () => {
  let http: HttpTestingController;
  let getAccessToken: ReturnType<typeof vi.fn>;

  function configure(baseUrl = 'https://api.example.test/') {
    getAccessToken = vi.fn().mockResolvedValue('access-token');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getAccessToken } },
        {
          provide: GIFT_CARD_API_CONFIG,
          useValue: { mode: 'local', baseUrl }
        }
      ]
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AdminGiftCardApiClient);
  }

  afterEach(() => {
    try {
      http?.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('gets the first page with the access token and default limit', async () => {
    const client = configure();
    const promise = firstValueFrom(client.listGiftCards());
    await Promise.resolve();

    const request = http.expectOne(
      (candidate) =>
        candidate.url === 'https://api.example.test/admin/gift-cards' &&
        candidate.params.get('limit') === '50'
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.request.params.has('nextToken')).toBe(false);
    request.flush({ items: [giftCard], nextToken: 'opaque-next' });

    await expect(promise).resolves.toEqual({ items: [giftCard], nextToken: 'opaque-next' });
    expect(getAccessToken).toHaveBeenCalledOnce();
  });

  it('sends an explicit limit and opaque next token through Angular query params', async () => {
    const client = configure('https://api.example.test////');
    const promise = firstValueFrom(client.listGiftCards(25, 'opaque+/= token'));
    await Promise.resolve();

    const request = http.expectOne(
      (candidate) =>
        candidate.url === 'https://api.example.test/admin/gift-cards' &&
        candidate.params.get('limit') === '25' &&
        candidate.params.get('nextToken') === 'opaque+/= token'
    );
    request.flush({ items: [] });

    await promise;
  });

  it('fails locally when no access token exists and never falls back to an ID token', async () => {
    const client = configure();
    getAccessToken.mockResolvedValue(null);

    await expect(firstValueFrom(client.listGiftCards())).rejects.toMatchObject({
      kind: 'authentication'
    });
    expect(getAccessToken).toHaveBeenCalledOnce();
    http.expectNone('https://api.example.test/admin/gift-cards');
  });

  it('fails locally when the API base URL is missing', async () => {
    const client = configure('   ');

    expect(client.isConfigured).toBe(false);
    await expect(firstValueFrom(client.listGiftCards())).rejects.toMatchObject({
      kind: 'configuration'
    });
    expect(getAccessToken).not.toHaveBeenCalled();
    http.expectNone('/admin/gift-cards');
  });

  it.each([401, 403])('normalizes HTTP %i without exposing the backend response', async (status) => {
    const client = configure();
    const promise = firstValueFrom(client.listGiftCards());
    await Promise.resolve();

    http.expectOne((request) => request.url.endsWith('/admin/gift-cards')).flush(
      { message: 'sensitive AWS detail' },
      { status, statusText: 'Denied' }
    );

    await expect(promise).rejects.toMatchObject({ kind: 'authentication' });
    await expect(promise).rejects.toBeInstanceOf(AdminGiftCardApiError);
    await expect(promise).rejects.not.toMatchObject({ message: expect.stringContaining('AWS') });
  });

  it.each([
    [0, 'network'],
    [500, 'server']
  ] as const)('normalizes HTTP %i as a safe %s failure', async (status, kind) => {
    const client = configure();
    const promise = firstValueFrom(client.listGiftCards());
    await Promise.resolve();

    http.expectOne((request) => request.url.endsWith('/admin/gift-cards')).flush(
      { token: 'must-not-leak', message: 'internal detail' },
      { status, statusText: 'Error' }
    );

    await expect(promise).rejects.toMatchObject({ kind });
    await expect(promise).rejects.not.toMatchObject({
      message: expect.stringContaining('internal detail')
    });
  });
});
