import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
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
