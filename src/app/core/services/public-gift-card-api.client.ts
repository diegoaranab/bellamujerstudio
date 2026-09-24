import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import {
  PublicGiftCardRequest,
  PublicGiftCardResponse
} from '../models/public-gift-card-request.model';
import { GIFT_CARD_API_CONFIG } from './gift-card-api-config';

export type GiftCardRequestErrorKind = 'validation' | 'client' | 'server' | 'network' | 'configuration';

export class GiftCardRequestError extends Error {
  constructor(readonly kind: GiftCardRequestErrorKind, message: string) {
    super(message);
    this.name = 'GiftCardRequestError';
  }
}

@Injectable({ providedIn: 'root' })
export class PublicGiftCardApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(GIFT_CARD_API_CONFIG);

  createRequest(request: PublicGiftCardRequest): Observable<PublicGiftCardResponse> {
    const baseUrl = this.config.baseUrl.trim().replace(/\/+$/, '');
    if (!baseUrl) {
      return throwError(() => new GiftCardRequestError('configuration', 'La API de tarjetas regalo no está configurada.'));
    }

    return this.http.post<PublicGiftCardResponse>(`${baseUrl}/gift-cards/request`, request).pipe(
      catchError((error: unknown) => throwError(() => this.normalizeError(error)))
    );
  }

  private normalizeError(error: unknown): GiftCardRequestError {
    if (!(error instanceof HttpErrorResponse)) {
      return new GiftCardRequestError('server', 'No pudimos guardar la solicitud. Intenta de nuevo.');
    }
    if (error.status === 0) {
      return new GiftCardRequestError('network', 'No se pudo conectar con el servidor. Intenta de nuevo.');
    }
    if (error.status === 400 || error.status === 422) {
      return new GiftCardRequestError('validation', 'Revisa los datos de la solicitud.');
    }
    if (error.status >= 400 && error.status < 500) {
      return new GiftCardRequestError('client', 'No se pudo procesar la solicitud. Intenta de nuevo.');
    }
    return new GiftCardRequestError('server', 'No pudimos guardar la solicitud. Intenta de nuevo en unos minutos.');
  }
}
