import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, from, switchMap, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import {
  ClubClient,
  ClubVisit,
  LoyaltyBalance,
  LoyaltyLedgerEntry
} from '../models';
import { CLUB_API_CONFIG } from './club-api-config';

export const DEFAULT_CLUB_PAGE_LIMIT = 50;
export const MAX_CLUB_PAGE_LIMIT = 100;

export interface AdminClubClientListResponse {
  items: ClubClient[];
  nextToken?: string;
}

export interface AdminClubClientDetailResponse {
  client: ClubClient;
  balance: LoyaltyBalance;
}

export interface AdminClubClientCreateRequest {
  name: string;
  phone: string;
}

export type AdminClubClientCreateResponse = AdminClubClientDetailResponse;

export interface AdminClubVisitCreateRequest {
  occurredAtISO: string;
  amountMXN: number;
  eligibleAmountMXN: number;
  serviceIds: string[];
}

export interface AdminClubVisitCreateResponse {
  visit: ClubVisit;
  loyalty: {
    stampsAwarded: 0 | 1;
    stampCountAfter: number;
    eligibleSpendCarryAfterMXN: number;
  };
  balance: LoyaltyBalance;
  replayed: boolean;
}

export interface AdminClubLedgerListResponse {
  items: LoyaltyLedgerEntry[];
  nextToken?: string;
}

export type AdminClubApiErrorKind =
  | 'configuration'
  | 'authentication'
  | 'validation'
  | 'not-found'
  | 'conflict'
  | 'network'
  | 'server';

export class AdminClubApiError extends Error {
  constructor(readonly kind: AdminClubApiErrorKind, message: string) {
    super(message);
    this.name = 'AdminClubApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class AdminClubApiClient {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly config = inject(CLUB_API_CONFIG);
  private readonly baseUrl = this.config.baseUrl.trim().replace(/\/+$/, '');

  readonly isConfigured = this.baseUrl.length > 0;

  listClients(
    limit = DEFAULT_CLUB_PAGE_LIMIT,
    nextToken?: string
  ): Observable<AdminClubClientListResponse> {
    return this.withAccessToken((headers) =>
      this.http.get<AdminClubClientListResponse>(`${this.baseUrl}/admin/club/clients`, {
        headers,
        params: this.paginationParams(limit, nextToken)
      })
    );
  }

  getClient(clientId: string): Observable<AdminClubClientDetailResponse> {
    return this.withAccessToken((headers) =>
      this.http.get<AdminClubClientDetailResponse>(
        `${this.baseUrl}/admin/club/clients/${encodeURIComponent(clientId)}`,
        { headers }
      )
    );
  }

  createClient(
    request: AdminClubClientCreateRequest
  ): Observable<AdminClubClientCreateResponse> {
    const body: AdminClubClientCreateRequest = {
      name: request.name,
      phone: request.phone
    };

    return this.withAccessToken((headers) =>
      this.http.post<AdminClubClientCreateResponse>(
        `${this.baseUrl}/admin/club/clients`,
        body,
        { headers }
      )
    );
  }

  registerVisit(
    clientId: string,
    request: AdminClubVisitCreateRequest,
    idempotencyKey: string
  ): Observable<AdminClubVisitCreateResponse> {
    const body: AdminClubVisitCreateRequest = {
      occurredAtISO: request.occurredAtISO,
      amountMXN: request.amountMXN,
      eligibleAmountMXN: request.eligibleAmountMXN,
      serviceIds: request.serviceIds
    };

    return this.withAccessToken((authorizationHeaders) =>
      this.http.post<AdminClubVisitCreateResponse>(
        `${this.baseUrl}/admin/club/clients/${encodeURIComponent(clientId)}/visits`,
        body,
        {
          headers: authorizationHeaders.set('Idempotency-Key', idempotencyKey)
        }
      )
    );
  }

  listLedgerEntries(
    clientId: string,
    limit = DEFAULT_CLUB_PAGE_LIMIT,
    nextToken?: string
  ): Observable<AdminClubLedgerListResponse> {
    return this.withAccessToken((headers) =>
      this.http.get<AdminClubLedgerListResponse>(
        `${this.baseUrl}/admin/club/clients/${encodeURIComponent(clientId)}/ledger`,
        { headers, params: this.paginationParams(limit, nextToken) }
      )
    );
  }

  private paginationParams(limit: number, nextToken?: string): HttpParams {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CLUB_PAGE_LIMIT) {
      throw new AdminClubApiError(
        'validation',
        `El límite debe ser un número entero entre 1 y ${MAX_CLUB_PAGE_LIMIT}.`
      );
    }

    let params = new HttpParams().set('limit', limit);
    if (nextToken !== undefined) {
      params = params.set('nextToken', nextToken);
    }
    return params;
  }

  private withAccessToken<T>(
    request: (headers: HttpHeaders) => Observable<T>
  ): Observable<T> {
    if (!this.isConfigured) {
      return throwError(
        () =>
          new AdminClubApiError(
            'configuration',
            'El servicio de Club no está configurado en este entorno.'
          )
      );
    }

    return defer(() => from(this.auth.getAccessToken())).pipe(
      switchMap((accessToken) => {
        if (!accessToken) {
          return throwError(
            () =>
              new AdminClubApiError(
                'authentication',
                'Tu sesión no permite administrar el Club.'
              )
          );
        }

        return request(new HttpHeaders({ Authorization: `Bearer ${accessToken}` }));
      }),
      catchError((error: unknown) => throwError(() => this.normalizeError(error)))
    );
  }

  private normalizeError(error: unknown): AdminClubApiError {
    if (error instanceof AdminClubApiError) {
      return error;
    }
    if (!(error instanceof HttpErrorResponse)) {
      return new AdminClubApiError(
        'server',
        'No fue posible procesar la solicitud del Club. Intenta de nuevo.'
      );
    }
    if (error.status === 0) {
      return new AdminClubApiError(
        'network',
        'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
      );
    }
    if (error.status === 401 || error.status === 403) {
      return new AdminClubApiError(
        'authentication',
        'Tu sesión no permite administrar el Club.'
      );
    }
    if (error.status === 400) {
      return new AdminClubApiError(
        'validation',
        'La información no es válida. Revísala e intenta de nuevo.'
      );
    }
    if (error.status === 404) {
      return new AdminClubApiError('not-found', 'La información solicitada ya no está disponible.');
    }
    if (error.status === 409) {
      return new AdminClubApiError(
        'conflict',
        'La solicitud entra en conflicto con información actual. Actualiza e intenta de nuevo.'
      );
    }
    return new AdminClubApiError(
      'server',
      'No fue posible procesar la solicitud del Club. Intenta de nuevo.'
    );
  }
}
