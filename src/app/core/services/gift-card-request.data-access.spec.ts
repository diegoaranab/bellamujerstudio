import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { GiftCard } from '../models/gift-card.model';
import { PublicGiftCardRequest, PublicGiftCardResponse } from '../models/public-gift-card-request.model';
import { GIFT_CARD_API_CONFIG, GiftCardApiConfig } from './gift-card-api-config';
import {
  ApiGiftCardRequestDataAccess,
  GIFT_CARD_REQUEST_DATA_ACCESS,
  LocalGiftCardRequestDataAccess
} from './gift-card-request.data-access';
import { GiftCardService } from './gift-card.service';
import { GiftCardRequestError, PublicGiftCardApiClient } from './public-gift-card-api.client';

const input: PublicGiftCardRequest = {
  buyerName: 'Diego', buyerPhone: '2381110000', recipientName: 'Lupita', amountMXN: 500
};
const idempotencyKey = '11111111-1111-4111-8111-111111111111';
const response: PublicGiftCardResponse = {
  ...input,
  id: 'gc-1', folio: 'BM-1', createdAtISO: '2026-09-24T00:00:00.000Z',
  updatedAtISO: '2026-09-24T00:00:00.000Z', status: 'pendiente', paymentMethod: 'transferencia'
};

function configure(mode: GiftCardApiConfig['mode'], baseUrl = 'http://localhost:3000/') {
  const createGiftCard = vi.fn(() => response as GiftCard);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: GIFT_CARD_API_CONFIG, useValue: { mode, baseUrl } },
      { provide: GiftCardService, useValue: { createGiftCard } }
    ]
  });
  return { createGiftCard, http: TestBed.inject(HttpTestingController) };
}

describe('PublicGiftCardApiClient', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('posts the public request and returns the 201 body', async () => {
    const { http } = configure('api');
    const promise = firstValueFrom(TestBed.inject(PublicGiftCardApiClient).createRequest(input, idempotencyKey));
    const request = http.expectOne('http://localhost:3000/gift-cards/request');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    expect(request.request.headers.get('Idempotency-Key')).toBe(idempotencyKey);
    request.flush(response, { status: 201, statusText: 'Created' });
    expect(await promise).toEqual(response);
  });

  it.each([
    [400, 'validation'], [403, 'client'], [500, 'server'], [0, 'network']
  ] as const)('normalizes HTTP %i as %s', async (status, kind) => {
    const { http } = configure('api');
    const promise = firstValueFrom(TestBed.inject(PublicGiftCardApiClient).createRequest(input, idempotencyKey));
    http.expectOne('http://localhost:3000/gift-cards/request').flush(
      { message: 'internal details' }, { status, statusText: 'Error' }
    );
    await expect(promise).rejects.toMatchObject({ kind });
    await expect(promise).rejects.toBeInstanceOf(GiftCardRequestError);
  });

  it('reports missing API configuration without making a request', async () => {
    const { http } = configure('api', '');
    await expect(firstValueFrom(TestBed.inject(PublicGiftCardApiClient).createRequest(input, idempotencyKey)))
      .rejects.toMatchObject({ kind: 'configuration' });
    http.expectNone('/gift-cards/request');
  });
});

describe('gift card request data access', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('defaults to local mode from the frontend environment', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(),
        { provide: GiftCardService, useValue: { createGiftCard: vi.fn() } }]
    });
    expect(TestBed.inject(GIFT_CARD_API_CONFIG).mode).toBe('local');
    expect(TestBed.inject(GIFT_CARD_REQUEST_DATA_ACCESS)).toBeInstanceOf(LocalGiftCardRequestDataAccess);
  });

  it('uses the local service with pending transfer defaults', async () => {
    const { createGiftCard } = configure('local');
    const adapter = TestBed.inject(GIFT_CARD_REQUEST_DATA_ACCESS);
    expect(adapter).toBeInstanceOf(LocalGiftCardRequestDataAccess);
    expect(await firstValueFrom(adapter.createRequest(input))).toEqual(response);
    expect(createGiftCard).toHaveBeenCalledWith({ ...input, status: 'pendiente', paymentMethod: 'transferencia' });
  });

  it('selects API mode, maps the response, and does not persist locally', async () => {
    const { createGiftCard, http } = configure('api');
    const adapter = TestBed.inject(GIFT_CARD_REQUEST_DATA_ACCESS);
    expect(adapter).toBeInstanceOf(ApiGiftCardRequestDataAccess);
    const promise = firstValueFrom(adapter.createRequest(input));
    http.expectOne('http://localhost:3000/gift-cards/request').flush(response, { status: 201, statusText: 'Created' });
    expect(await promise).toEqual(response);
    expect(createGiftCard).not.toHaveBeenCalled();
  });
});
