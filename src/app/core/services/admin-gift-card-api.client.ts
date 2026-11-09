import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, from, switchMap, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { GiftCard } from '../models';
import { GIFT_CARD_API_CONFIG } from './gift-card-api-config';

export interface AdminGiftCardListResponse {
  items: GiftCard[];
  nextToken?: string;
}

export type AdminGiftCardApiErrorKind =
  | 'configuration'
  | 'authentication'
  | 'network'
  | 'server';

export class AdminGiftCardApiError extends Error {
  constructor(readonly kind: AdminGiftCardApiErrorKind, message: string) {
    super(message);
    this.name = 'AdminGiftCardApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class AdminGiftCardApiClient {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly config = inject(GIFT_CARD_API_CONFIG);
  private readonly baseUrl = this.config.baseUrl.trim().replace(/\/+$/, '');

  readonly isConfigured = this.baseUrl.length > 0;

  listGiftCards(limit = 50, nextToken?: string): Observable<AdminGiftCardListResponse> {
    if (!this.isConfigured) {
      return throwError(
        () =>
          new AdminGiftCardApiError(
            'configuration',
            'Las solicitudes en línea no están configuradas en este entorno.'
          )
      );
    }

    return defer(() => from(this.auth.getAccessToken())).pipe(
      switchMap((accessToken) => {
        if (!accessToken) {
          return throwError(
            () =>
              new AdminGiftCardApiError(
                'authentication',
                'Tu sesión no permite consultar las solicitudes en línea.'
              )
          );
        }

        let params = new HttpParams().set('limit', limit);
        if (nextToken !== undefined) {
          params = params.set('nextToken', nextToken);
        }

        return this.http.get<AdminGiftCardListResponse>(`${this.baseUrl}/admin/gift-cards`, {
          headers: new HttpHeaders({ Authorization: `Bearer ${accessToken}` }),
          params
        });
      }),
      catchError((error: unknown) => throwError(() => this.normalizeError(error)))
    );
  }

  private normalizeError(error: unknown): AdminGiftCardApiError {
    if (error instanceof AdminGiftCardApiError) {
      return error;
    }
    if (!(error instanceof HttpErrorResponse)) {
      return new AdminGiftCardApiError(
        'server',
        'No fue posible consultar las solicitudes en línea. Intenta de nuevo.'
      );
    }
    if (error.status === 0) {
      return new AdminGiftCardApiError(
        'network',
        'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
      );
    }
    if (error.status === 401 || error.status === 403) {
      return new AdminGiftCardApiError(
        'authentication',
        'Tu sesión no permite consultar las solicitudes en línea.'
      );
    }
    return new AdminGiftCardApiError(
      'server',
      'No fue posible consultar las solicitudes en línea. Intenta de nuevo.'
    );
  }
}
