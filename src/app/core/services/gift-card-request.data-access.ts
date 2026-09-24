import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, defer, map, of } from 'rxjs';
import { GiftCard } from '../models/gift-card.model';
import { PublicGiftCardRequest } from '../models/public-gift-card-request.model';
import { GIFT_CARD_API_CONFIG } from './gift-card-api-config';
import { GiftCardService } from './gift-card.service';
import { PublicGiftCardApiClient } from './public-gift-card-api.client';

export interface GiftCardRequestDataAccess {
  createRequest(request: PublicGiftCardRequest, idempotencyKey?: string): Observable<GiftCard>;
}

@Injectable({ providedIn: 'root' })
export class LocalGiftCardRequestDataAccess implements GiftCardRequestDataAccess {
  private readonly giftCards = inject(GiftCardService);

  createRequest(request: PublicGiftCardRequest): Observable<GiftCard> {
    return defer(() => of(this.giftCards.createGiftCard({
      ...request,
      paymentMethod: 'transferencia',
      status: 'pendiente'
    })));
  }
}

@Injectable({ providedIn: 'root' })
export class ApiGiftCardRequestDataAccess implements GiftCardRequestDataAccess {
  private readonly api = inject(PublicGiftCardApiClient);

  createRequest(request: PublicGiftCardRequest, idempotencyKey?: string): Observable<GiftCard> {
    return this.api.createRequest(request, idempotencyKey ?? crypto.randomUUID())
      .pipe(map((response) => ({ ...response })));
  }
}

export const GIFT_CARD_REQUEST_DATA_ACCESS = new InjectionToken<GiftCardRequestDataAccess>(
  'Gift card request data access',
  {
    providedIn: 'root',
    factory: () => inject(GIFT_CARD_API_CONFIG).mode === 'api'
      ? inject(ApiGiftCardRequestDataAccess)
      : inject(LocalGiftCardRequestDataAccess)
  }
);
