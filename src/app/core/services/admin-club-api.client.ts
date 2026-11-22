import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, from, map, switchMap, throwError } from 'rxjs';

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

export interface AdminClubAccessSummary {
  status: 'invited' | 'active' | 'disabled';
  credentialVersion: number;
  invitationGeneration: number;
  hasPin: boolean;
  updatedAtISO: string;
}

export interface AdminClubAccessReadResponse {
  access: AdminClubAccessSummary | null;
}

export interface AdminClubAccessInvitation {
  activationFragment: string;
  expiresAtISO: string;
}

export interface AdminClubAccessMutationResponse {
  access: AdminClubAccessSummary;
  invitation: AdminClubAccessInvitation;
}

export type AdminClubPromotionStatus = 'active' | 'inactive';

export interface AdminClubPromotion {
  promotionId: string;
  title: string;
  description: string;
  status: AdminClubPromotionStatus;
  startsAtISO: string;
  endsAtISO: string;
  createdAtISO: string;
  updatedAtISO: string;
}

export interface AdminClubPromotionListResponse { items: AdminClubPromotion[]; }
export interface AdminClubPromotionDetailResponse { promotion: AdminClubPromotion; }
export interface AdminClubPromotionCreateRequest {
  title: string;
  description: string;
  status: AdminClubPromotionStatus;
  startsAtLocal: string;
  endsAtLocal: string;
}
export interface AdminClubPromotionCreateResponse extends AdminClubPromotionDetailResponse {
  replayed: boolean;
}
export interface AdminClubPromotionUpdateRequest {
  expectedUpdatedAtISO: string;
  title?: string;
  description?: string;
  status?: AdminClubPromotionStatus;
  startsAtLocal?: string;
  endsAtLocal?: string;
}
export interface AdminClubPromotionDeleteRequest { expectedUpdatedAtISO: string; }
export interface AdminClubPromotionDeleteResponse { deleted: true; promotionId: string; }

export type AdminClubApiErrorCode =
  | 'PROMOTION_NOT_FOUND'
  | 'PROMOTION_CONFLICT'
  | 'PROMOTION_CATALOG_FULL'
  | 'IDEMPOTENCY_CONFLICT'
  | 'VALIDATION_ERROR';

export type AdminClubApiErrorKind =
  | 'configuration'
  | 'authentication'
  | 'validation'
  | 'not-found'
  | 'conflict'
  | 'network'
  | 'server';

export class AdminClubApiError extends Error {
  constructor(
    readonly kind: AdminClubApiErrorKind,
    message: string,
    readonly code?: AdminClubApiErrorCode
  ) {
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

  getClientAccess(clientId: string): Observable<AdminClubAccessReadResponse> {
    return this.withAccessToken((headers) =>
      this.http.get<AdminClubAccessReadResponse>(
        `${this.baseUrl}/admin/club/clients/${encodeURIComponent(clientId)}/access`,
        { headers }
      )
    );
  }

  generateClientAccessInvitation(
    clientId: string
  ): Observable<AdminClubAccessMutationResponse> {
    return this.withAccessToken((headers) =>
      this.http.request<AdminClubAccessMutationResponse>(
        'POST',
        `${this.baseUrl}/admin/club/clients/${encodeURIComponent(clientId)}/access/invitation`,
        { headers }
      )
    );
  }

  resetClientAccess(clientId: string): Observable<AdminClubAccessMutationResponse> {
    return this.withAccessToken((headers) =>
      this.http.request<AdminClubAccessMutationResponse>(
        'POST',
        `${this.baseUrl}/admin/club/clients/${encodeURIComponent(clientId)}/access/reset`,
        { headers }
      )
    );
  }

  listPromotions(): Observable<AdminClubPromotionListResponse> {
    return this.withAccessToken((headers) =>
      this.http.get<unknown>(`${this.baseUrl}/admin/club/promotions`, { headers }).pipe(
        map((response) => {
          if (!this.isPromotionListResponse(response)) throw this.safePromotionServerError();
          return response;
        })
      ), true
    );
  }

  getPromotion(promotionId: string): Observable<AdminClubPromotionDetailResponse> {
    if (!promotionId) return throwError(() => this.promotionValidationError());
    return this.withAccessToken((headers) =>
      this.http.get<unknown>(`${this.baseUrl}/admin/club/promotions/${encodeURIComponent(promotionId)}`, { headers }).pipe(
        map((response) => {
          if (!this.isPromotionDetailResponse(response)) throw this.safePromotionServerError();
          return response;
        })
      ), true
    );
  }

  createPromotion(
    request: AdminClubPromotionCreateRequest,
    idempotencyKey: string
  ): Observable<AdminClubPromotionCreateResponse> {
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      return throwError(() => this.promotionValidationError());
    }
    const body = {
      title: request.title,
      description: request.description,
      status: request.status,
      startsAtLocal: request.startsAtLocal,
      endsAtLocal: request.endsAtLocal
    };
    return this.withAccessToken((headers) =>
      this.http.post<unknown>(`${this.baseUrl}/admin/club/promotions`, body, {
        headers: headers.set('Idempotency-Key', idempotencyKey)
      }).pipe(
        map((response) => {
          if (!this.isPromotionCreateResponse(response)) throw this.safePromotionServerError();
          return response;
        })
      ), true
    );
  }

  updatePromotion(
    promotionId: string,
    request: AdminClubPromotionUpdateRequest
  ): Observable<AdminClubPromotionDetailResponse> {
    if (!promotionId || !request || typeof request.expectedUpdatedAtISO !== 'string' || !request.expectedUpdatedAtISO) {
      return throwError(() => this.promotionValidationError());
    }
    const body: Record<string, unknown> = { expectedUpdatedAtISO: request.expectedUpdatedAtISO };
    for (const field of ['title', 'description', 'status', 'startsAtLocal', 'endsAtLocal'] as const) {
      if (Object.prototype.hasOwnProperty.call(request, field) && request[field] !== undefined && request[field] !== null) {
        body[field] = request[field];
      }
    }
    return this.withAccessToken((headers) =>
      this.http.patch<unknown>(`${this.baseUrl}/admin/club/promotions/${encodeURIComponent(promotionId)}`, body, { headers }).pipe(
        map((response) => {
          if (!this.isPromotionDetailResponse(response)) throw this.safePromotionServerError();
          return response;
        })
      ), true
    );
  }

  deletePromotion(
    promotionId: string,
    request: AdminClubPromotionDeleteRequest
  ): Observable<AdminClubPromotionDeleteResponse> {
    if (!promotionId || !request || typeof request.expectedUpdatedAtISO !== 'string' || !request.expectedUpdatedAtISO) {
      return throwError(() => this.promotionValidationError());
    }
    return this.withAccessToken((headers) =>
      this.http.request<unknown>('DELETE', `${this.baseUrl}/admin/club/promotions/${encodeURIComponent(promotionId)}`, {
        headers, body: { expectedUpdatedAtISO: request.expectedUpdatedAtISO }
      }).pipe(
        map((response) => {
          if (!this.isPromotionDeleteResponse(response)) throw this.safePromotionServerError();
          return response;
        })
      ), true
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
    request: (headers: HttpHeaders) => Observable<T>,
    promotion = false
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
      catchError((error: unknown) => throwError(() => this.normalizeError(error, promotion)))
    );
  }

  private normalizeError(error: unknown, promotion = false): AdminClubApiError {
    if (error instanceof AdminClubApiError) {
      return error;
    }
    if (!(error instanceof HttpErrorResponse)) {
      return new AdminClubApiError(
        'server',
        'No fue posible procesar la solicitud del Club. Intenta de nuevo.'
      );
    }
    if (promotion) {
      const code = this.safePromotionErrorCode(error.error);
      const mapped = this.promotionCodeError(error.status, code);
      if (mapped) return mapped;
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  private hasExactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
    return this.isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  }

  private isPromotion(value: unknown): value is AdminClubPromotion {
    if (!this.hasExactKeys(value, ['promotionId', 'title', 'description', 'status', 'startsAtISO', 'endsAtISO', 'createdAtISO', 'updatedAtISO'])) return false;
    return typeof value['promotionId'] === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value['promotionId']) &&
      typeof value['title'] === 'string' && this.isSafePromotionText(value['title'], false) &&
      typeof value['description'] === 'string' && this.isSafePromotionText(value['description'], true) &&
      (value['status'] === 'active' || value['status'] === 'inactive') &&
      this.isCanonicalUtcISO(value['startsAtISO']) && this.isCanonicalUtcISO(value['endsAtISO']) &&
      this.isCanonicalUtcISO(value['createdAtISO']) && this.isCanonicalUtcISO(value['updatedAtISO']) &&
      Date.parse(value['startsAtISO']) < Date.parse(value['endsAtISO']);
  }

  private isPromotionListResponse(value: unknown): value is AdminClubPromotionListResponse {
    return this.hasExactKeys(value, ['items']) && Array.isArray(value['items']) && value['items'].every((item) => this.isPromotion(item));
  }

  private isPromotionDetailResponse(value: unknown): value is AdminClubPromotionDetailResponse {
    return this.hasExactKeys(value, ['promotion']) && this.isPromotion(value['promotion']);
  }

  private isPromotionCreateResponse(value: unknown): value is AdminClubPromotionCreateResponse {
    return this.hasExactKeys(value, ['promotion', 'replayed']) && this.isPromotion(value['promotion']) && typeof value['replayed'] === 'boolean';
  }

  private isPromotionDeleteResponse(value: unknown): value is AdminClubPromotionDeleteResponse {
    return this.hasExactKeys(value, ['deleted', 'promotionId']) && value['deleted'] === true &&
      typeof value['promotionId'] === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value['promotionId']);
  }

  private isCanonicalUtcISO(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
    const epoch = Date.parse(value);
    return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
  }

  private isSafePromotionText(value: string, allowLineFeeds: boolean): boolean {
    if (!value.trim()) return false;
    return allowLineFeeds ? !/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/.test(value) : !/[\u0000-\u001F\u007F-\u009F]/.test(value);
  }

  private safePromotionErrorCode(body: unknown): AdminClubApiErrorCode | undefined {
    if (!this.isRecord(body) || typeof body['error'] !== 'string') return undefined;
    const allowed: AdminClubApiErrorCode[] = ['PROMOTION_NOT_FOUND', 'PROMOTION_CONFLICT', 'PROMOTION_CATALOG_FULL', 'IDEMPOTENCY_CONFLICT', 'VALIDATION_ERROR'];
    return allowed.includes(body['error'] as AdminClubApiErrorCode) ? body['error'] as AdminClubApiErrorCode : undefined;
  }

  private promotionCodeError(status: number, code?: AdminClubApiErrorCode): AdminClubApiError | undefined {
    const entries: Record<AdminClubApiErrorCode, [AdminClubApiErrorKind, string, number]> = {
      PROMOTION_NOT_FOUND: ['not-found', 'La promoción ya no está disponible.', 404],
      PROMOTION_CONFLICT: ['conflict', 'La promoción cambió mientras la estabas editando. Recarga la información e intenta de nuevo.', 409],
      PROMOTION_CATALOG_FULL: ['conflict', 'El catálogo de promociones alcanzó su límite.', 409],
      IDEMPOTENCY_CONFLICT: ['conflict', 'No pudimos confirmar esta creación de forma segura. Actualiza el catálogo antes de intentar de nuevo.', 409],
      VALIDATION_ERROR: ['validation', 'La información de la promoción no es válida. Revísala e intenta de nuevo.', 400]
    };
    if (!code) return undefined;
    const [kind, message, expectedStatus] = entries[code];
    return expectedStatus === status ? new AdminClubApiError(kind, message, code) : undefined;
  }

  private safePromotionServerError(): AdminClubApiError {
    return new AdminClubApiError('server', 'No fue posible procesar la solicitud del Club. Intenta de nuevo.');
  }

  private promotionValidationError(): AdminClubApiError {
    return new AdminClubApiError('validation', 'La solicitud de promoción no es válida. Revísala e intenta de nuevo.');
  }
}
