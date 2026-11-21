import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { CLUB_API_CONFIG } from './club-api-config';
import { isCanonicalMemberClubCredential } from './member-club-credential';

export interface MemberClubSession {
  token: string;
  expiresAtISO: string;
}

export interface MemberClubSessionResponse {
  session: MemberClubSession;
}

export interface MemberClubSessionProbeResponse {
  authenticated: true;
}

export interface MemberClubSelfSummary {
  profile: {
    name: string;
  };
  loyalty: {
    stampCount: number;
  };
}

export interface MemberClubQrIdentification {
  identifier: string;
}

export type MemberClubHistoryType =
  | 'ELIGIBLE_SPEND_ADDED'
  | 'STAMP_EARNED'
  | 'ADMIN_ADJUSTMENT';

export interface MemberClubHistoryItem {
  occurredAtISO: string;
  type: MemberClubHistoryType;
  stampDelta: number;
  stampCountAfter: number;
}

export interface MemberClubHistoryPage {
  items: MemberClubHistoryItem[];
  nextToken?: string;
}

export interface MemberClubPromotion {
  title: string;
  description: string;
  startsAtISO: string;
  endsAtISO: string;
}

export type MemberClubApiErrorKind =
  | 'configuration'
  | 'validation'
  | 'invitation'
  | 'authentication'
  | 'throttled'
  | 'conflict'
  | 'network'
  | 'server';

const DEFAULT_RETRY_AFTER_SECONDS = 60;

export class MemberClubApiError extends Error {
  constructor(
    readonly kind: MemberClubApiErrorKind,
    message: string,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'MemberClubApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class MemberClubApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(CLUB_API_CONFIG);
  private readonly baseUrl = this.config.baseUrl.trim().replace(/\/+$/, '');

  readonly isConfigured = this.baseUrl.length > 0;

  enroll(
    accessHandle: string,
    invitationToken: string,
    pin: string
  ): Observable<MemberClubSessionResponse> {
    const validationError = this.validateCredentials(accessHandle, pin, invitationToken);
    if (validationError) return throwError(() => validationError);

    return this.requestSession(
      this.http.post<unknown>(`${this.baseUrl}/club/access/enroll`, {
        accessHandle,
        invitationToken,
        pin
      })
    );
  }

  login(accessHandle: string, pin: string): Observable<MemberClubSessionResponse> {
    const validationError = this.validateCredentials(accessHandle, pin);
    if (validationError) return throwError(() => validationError);

    return this.requestSession(
      this.http.post<unknown>(`${this.baseUrl}/club/access/login`, {
        accessHandle,
        pin
      })
    );
  }

  logout(sessionToken: string): Observable<void> {
    return this.withSessionToken(sessionToken, (headers) =>
      this.http.post<void>(`${this.baseUrl}/club/access/logout`, null, { headers })
    );
  }

  checkSession(sessionToken: string): Observable<MemberClubSessionProbeResponse> {
    return this.withSessionToken(sessionToken, (headers) =>
      this.http.get<unknown>(`${this.baseUrl}/club/access/session`, { headers }).pipe(
        map((response) => {
          if (!this.isAuthenticatedProbe(response)) throw this.safeServerError();
          return response;
        })
      )
    );
  }

  getSelfSummary(sessionToken: string): Observable<MemberClubSelfSummary> {
    return this.withSessionToken(sessionToken, (headers) =>
      this.http.get<unknown>(`${this.baseUrl}/club/me`, { headers }).pipe(
        map((response) => {
          if (!this.isSelfSummary(response)) throw this.safeServerError();
          return {
            profile: { name: response.profile.name.trim() },
            loyalty: { stampCount: response.loyalty.stampCount }
          };
        })
      )
    );
  }

  getQr(sessionToken: string): Observable<MemberClubQrIdentification> {
    return this.withSessionToken(sessionToken, (headers) =>
      this.http.get<unknown>(`${this.baseUrl}/club/me/qr`, { headers }).pipe(
        map((response) => {
          if (!this.isQrResponse(response)) throw this.safeServerError();
          return { identifier: response.qr.identifier };
        })
      )
    );
  }

  getHistory(
    sessionToken: string,
    options: { limit?: number; nextToken?: string } = {}
  ): Observable<MemberClubHistoryPage> {
    const limit = options.limit ?? 5;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      return throwError(() => new MemberClubApiError('validation', 'La solicitud del Club no es válida.'));
    }
    if (options.nextToken !== undefined && !this.isHistoryToken(options.nextToken)) {
      return throwError(() => new MemberClubApiError('validation', 'La solicitud del Club no es válida.'));
    }

    return this.withSessionToken(sessionToken, (headers) => {
      let params = new HttpParams().set('limit', String(limit));
      if (options.nextToken) params = params.set('nextToken', options.nextToken);
      return this.http.get<unknown>(`${this.baseUrl}/club/me/history`, { headers, params }).pipe(
        map((response) => {
          if (!this.isHistoryPage(response)) throw this.safeServerError();
          return {
            items: response.items.map((item) => ({
              occurredAtISO: item.occurredAtISO,
              type: item.type,
              stampDelta: item.stampDelta,
              stampCountAfter: item.stampCountAfter
            })),
            ...(response.nextToken ? { nextToken: response.nextToken } : {})
          };
        })
      );
    });
  }

  getPromotion(sessionToken: string): Observable<MemberClubPromotion | null> {
    return this.withSessionToken(sessionToken, (headers) =>
      this.http.get<unknown>(`${this.baseUrl}/club/me/promotions`, { headers }).pipe(
        map((response) => {
          if (!this.isPromotionResponse(response)) throw this.safeServerError();
          if (response.promotion === null) return null;
          return {
            title: response.promotion.title.trim(),
            description: response.promotion.description.trim(),
            startsAtISO: response.promotion.startsAtISO,
            endsAtISO: response.promotion.endsAtISO
          };
        })
      )
    );
  }

  private requestSession(request: Observable<unknown>): Observable<MemberClubSessionResponse> {
    if (!this.isConfigured) return throwError(() => this.configurationError());

    return request.pipe(
      map((response) => {
        if (!this.isSessionResponse(response)) throw this.safeServerError();
        return response;
      }),
      catchError((error: unknown) => throwError(() => this.normalizeError(error)))
    );
  }

  private withSessionToken<T>(
    sessionToken: string,
    request: (headers: HttpHeaders) => Observable<T>
  ): Observable<T> {
    if (!this.isConfigured) return throwError(() => this.configurationError());
    if (!isCanonicalMemberClubCredential(sessionToken)) {
      return throwError(
        () => new MemberClubApiError('authentication', 'Tu sesión del Club ya no está activa.')
      );
    }

    return request(new HttpHeaders({ Authorization: `Bearer ${sessionToken}` })).pipe(
      catchError((error: unknown) => throwError(() => this.normalizeError(error)))
    );
  }

  private validateCredentials(
    accessHandle: string,
    pin: string,
    invitationToken?: string
  ): MemberClubApiError | null {
    if (!this.isConfigured) return this.configurationError();
    if (
      !isCanonicalMemberClubCredential(accessHandle) ||
      (invitationToken !== undefined && !isCanonicalMemberClubCredential(invitationToken))
    ) {
      return new MemberClubApiError(
        invitationToken === undefined ? 'authentication' : 'invitation',
        invitationToken === undefined
          ? 'No pudimos validar el acceso. Revisa tu NIP e intenta nuevamente.'
          : 'Este enlace ya no es válido. Solicita uno nuevo en Bella Mujer Studio.'
      );
    }
    if (!/^\d{6}$/.test(pin)) {
      return new MemberClubApiError('validation', 'El NIP debe tener exactamente seis dígitos.');
    }
    return null;
  }

  private normalizeError(error: unknown): MemberClubApiError {
    if (error instanceof MemberClubApiError) return error;
    if (!(error instanceof HttpErrorResponse)) return this.safeServerError();
    if (error.status === 0) {
      return new MemberClubApiError(
        'network',
        'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
      );
    }

    const code = this.safeErrorCode(error.error);
    switch (code) {
      case 'CLUB_ACCESS_INVITATION_INVALID':
        return new MemberClubApiError(
          'invitation',
          'Este enlace ya no es válido. Solicita uno nuevo en Bella Mujer Studio.'
        );
      case 'CLUB_PIN_INVALID':
        return new MemberClubApiError(
          'validation',
          'Elige un NIP de seis dígitos que no sea común ni repetido.'
        );
      case 'CLUB_ACCESS_AUTHENTICATION_FAILED':
        return new MemberClubApiError(
          'authentication',
          'No pudimos validar el acceso. Revisa tu NIP e intenta nuevamente.'
        );
      case 'CLUB_ACCESS_THROTTLED': {
        const retryAfterSeconds = this.safeRetryAfterSeconds(error.error);
        return new MemberClubApiError(
          'throttled',
          `Espera ${retryAfterSeconds} segundos antes de intentar nuevamente.`,
          retryAfterSeconds
        );
      }
      case 'CLUB_ACCESS_CONCURRENT_UPDATE':
        return new MemberClubApiError(
          'conflict',
          'El acceso cambió mientras procesábamos la solicitud. Intenta nuevamente.'
        );
      default:
        if (error.status === 401 || error.status === 403) {
          return new MemberClubApiError('authentication', 'Tu sesión del Club ya no está activa.');
        }
        return this.safeServerError();
    }
  }

  private safeErrorCode(body: unknown): string | undefined {
    if (!body || typeof body !== 'object' || !('error' in body)) return undefined;
    return typeof body.error === 'string' ? body.error : undefined;
  }

  private safeRetryAfterSeconds(body: unknown): number {
    if (!body || typeof body !== 'object' || !('retryAfterSeconds' in body)) {
      return DEFAULT_RETRY_AFTER_SECONDS;
    }
    const value = body.retryAfterSeconds;
    return Number.isSafeInteger(value) && typeof value === 'number' && value >= 1 && value <= 3600
      ? value
      : DEFAULT_RETRY_AFTER_SECONDS;
  }

  private isSessionResponse(value: unknown): value is MemberClubSessionResponse {
    if (!value || typeof value !== 'object' || !('session' in value)) return false;
    const session = value.session;
    if (
      !!session &&
      typeof session === 'object' &&
      'token' in session &&
      isCanonicalMemberClubCredential(session.token) &&
      'expiresAtISO' in session &&
      typeof session.expiresAtISO === 'string'
    ) {
      const expiresAt = Date.parse(session.expiresAtISO);
      return (
        Number.isFinite(expiresAt) &&
        new Date(expiresAt).toISOString() === session.expiresAtISO &&
        expiresAt > Date.now()
      );
    }
    return false;
  }

  private isAuthenticatedProbe(value: unknown): value is MemberClubSessionProbeResponse {
    return (
      !!value &&
      typeof value === 'object' &&
      'authenticated' in value &&
      value.authenticated === true
    );
  }

  private isQrResponse(value: unknown): value is { qr: MemberClubQrIdentification } {
    if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 || !('qr' in value)) {
      return false;
    }
    const qr = value.qr;
    return !!qr && typeof qr === 'object' && Object.keys(qr).length === 1 &&
      'identifier' in qr && typeof qr.identifier === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(qr.identifier);
  }

  private isSelfSummary(value: unknown): value is MemberClubSelfSummary {
    if (!value || typeof value !== 'object' || !('profile' in value) || !('loyalty' in value)) {
      return false;
    }
    const profile = value.profile;
    const loyalty = value.loyalty;
    return (
      !!profile &&
      typeof profile === 'object' &&
      'name' in profile &&
      typeof profile.name === 'string' &&
      profile.name.trim().length > 0 &&
      !!loyalty &&
      typeof loyalty === 'object' &&
      'stampCount' in loyalty &&
      typeof loyalty.stampCount === 'number' &&
      Number.isSafeInteger(loyalty.stampCount) &&
      loyalty.stampCount >= 0
    );
  }

  private isHistoryPage(value: unknown): value is MemberClubHistoryPage {
    if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) {
      return false;
    }
    if ('nextToken' in value && value.nextToken !== undefined && !this.isHistoryToken(value.nextToken)) {
      return false;
    }
    return value.items.every((item) => this.isHistoryItem(item));
  }

  private isHistoryItem(value: unknown): value is MemberClubHistoryItem {
    if (!value || typeof value !== 'object') return false;
    if (!('occurredAtISO' in value) || typeof value.occurredAtISO !== 'string') return false;
    const occurredAt = Date.parse(value.occurredAtISO);
    if (!Number.isFinite(occurredAt) || new Date(occurredAt).toISOString() !== value.occurredAtISO) {
      return false;
    }
    return (
      'type' in value &&
      (value.type === 'ELIGIBLE_SPEND_ADDED' || value.type === 'STAMP_EARNED' || value.type === 'ADMIN_ADJUSTMENT') &&
      'stampDelta' in value &&
      typeof value.stampDelta === 'number' &&
      Number.isSafeInteger(value.stampDelta) &&
      'stampCountAfter' in value &&
      typeof value.stampCountAfter === 'number' &&
      Number.isSafeInteger(value.stampCountAfter) &&
      value.stampCountAfter >= 0
    );
  }

  private isHistoryToken(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 2048;
  }

  private isPromotionResponse(
    value: unknown
  ): value is { promotion: MemberClubPromotion | null } {
    if (
      !value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== 1 || !('promotion' in value)
    ) return false;
    if (value.promotion === null) return true;
    const promotion = value.promotion;
    if (
      !promotion || typeof promotion !== 'object' || Array.isArray(promotion) ||
      Object.keys(promotion).length !== 4 ||
      !('title' in promotion) || !this.isPromotionText(promotion.title, false) ||
      !('description' in promotion) || !this.isPromotionText(promotion.description, true) ||
      !('startsAtISO' in promotion) || !this.isCanonicalUtcISO(promotion.startsAtISO) ||
      !('endsAtISO' in promotion) || !this.isCanonicalUtcISO(promotion.endsAtISO)
    ) return false;
    return Date.parse(promotion.startsAtISO) < Date.parse(promotion.endsAtISO);
  }

  private isCanonicalUtcISO(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const epoch = Date.parse(value);
    return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
  }

  private isPromotionText(value: unknown, allowLineFeeds: boolean): value is string {
    if (typeof value !== 'string' || !value.trim()) return false;
    return allowLineFeeds
      ? !/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/.test(value)
      : !/[\u0000-\u001F\u007F-\u009F]/.test(value);
  }

  private configurationError(): MemberClubApiError {
    return new MemberClubApiError(
      'configuration',
      'El servicio de Club no está configurado en este entorno.'
    );
  }

  private safeServerError(): MemberClubApiError {
    return new MemberClubApiError(
      'server',
      'No fue posible procesar la solicitud del Club. Intenta de nuevo.'
    );
  }
}
