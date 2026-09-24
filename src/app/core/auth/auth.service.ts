import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AUTH_CONFIG } from './auth-config';
import { OIDC_CLIENT_FACTORY, OidcClient, OidcUser } from './oidc-client';

export type AuthStatus = 'checking' | 'local' | 'authenticated' | 'unauthenticated' | 'error';

const DEFAULT_ADMIN_RETURN_URL = '/admin/inicio';

export function normalizeAdminReturnUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_ADMIN_RETURN_URL;
  }

  const path = value.split(/[?#]/, 1)[0];
  if ((path !== '/admin' && !path.startsWith('/admin/')) || path === '/admin/login') {
    return DEFAULT_ADMIN_RETURN_URL;
  }

  return value;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(AUTH_CONFIG);
  private readonly clientFactory = inject(OIDC_CLIENT_FACTORY);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly currentUser = signal<OidcUser | null>(null);
  private readonly authStatus = signal<AuthStatus>('checking');
  private readonly authError = signal<string | null>(null);

  private client: OidcClient | null = null;
  private clientPromise: Promise<OidcClient> | null = null;
  private initializePromise: Promise<void> | null = null;

  readonly mode = this.config.mode;
  readonly status = this.authStatus.asReadonly();
  readonly errorMessage = this.authError.asReadonly();
  readonly isAuthenticated = computed(
    () => this.authStatus() === 'authenticated' && this.currentUser() !== null
  );
  readonly isCognitoMode = this.mode === 'cognito';

  initialize(): Promise<void> {
    if (!this.initializePromise) {
      this.initializePromise = this.initializeInternal();
    }

    return this.initializePromise;
  }

  async login(returnUrl: string): Promise<void> {
    if (!this.isCognitoMode) {
      return;
    }

    this.authError.set(null);

    try {
      const client = await this.getClient();
      await client.signinRedirect({
        state: { returnUrl: normalizeAdminReturnUrl(returnUrl) }
      });
    } catch {
      this.authStatus.set('error');
      this.authError.set(
        'No fue posible iniciar sesión. Revisa la configuración de Cognito e intenta de nuevo.'
      );
    }
  }

  async logout(): Promise<void> {
    const client = this.client;
    if (client) {
      try {
        await client.removeUser();
      } catch {
        // The in-memory state is still cleared even if browser storage is unavailable.
      }
    }

    this.currentUser.set(null);
    this.authError.set(null);
    this.authStatus.set(this.isCognitoMode ? 'unauthenticated' : 'local');

    if (this.isCognitoMode && client) {
      try {
        await client.signoutRedirect();
      } catch {
        this.authStatus.set('error');
        this.authError.set(
          'La sesión local se cerró, pero no fue posible cerrar la sesión de Cognito.'
        );
      }
    }
  }

  async getToken(): Promise<string | null> {
    await this.initialize();

    if (!this.isCognitoMode || !this.client) {
      return null;
    }

    try {
      const user = await this.client.getUser();
      if (!this.isValidUser(user)) {
        await this.clearInvalidUser();
        return null;
      }

      this.currentUser.set(user);
      this.authStatus.set('authenticated');
      return user.access_token || user.id_token || null;
    } catch {
      await this.clearInvalidUser();
      return null;
    }
  }

  private async initializeInternal(): Promise<void> {
    if (!this.isCognitoMode) {
      this.authStatus.set('local');
      return;
    }

    const hasAuthorizationResponse = this.hasAuthorizationResponse();

    try {
      const client = await this.getClient();
      client.events.addAccessTokenExpired(() => {
        this.handleAccessTokenExpired(client);
      });

      const user = hasAuthorizationResponse
        ? await client.signinRedirectCallback(this.document.location.href)
        : await client.getUser();

      if (!this.isValidUser(user)) {
        await this.clearInvalidUser();
        return;
      }

      this.currentUser.set(user);
      this.authStatus.set('authenticated');
      this.authError.set(null);

      if (hasAuthorizationResponse) {
        this.finishAuthorizationRedirect(user.state);
      }
    } catch {
      await this.clearInvalidUser();
      if (hasAuthorizationResponse) {
        this.finishFailedAuthorizationRedirect();
      }
      this.authStatus.set('error');
      this.authError.set(
        'La sesión no es válida o no pudo completarse. Inicia sesión nuevamente.'
      );
    }
  }

  private async getClient(): Promise<OidcClient> {
    if (this.client) {
      return this.client;
    }

    if (this.clientPromise) {
      return this.clientPromise;
    }

    const { authority, clientId, hostedUiDomain } = this.config.cognito;
    if (!authority || !clientId || !hostedUiDomain) {
      throw new Error('Cognito no está configurado.');
    }

    this.clientPromise = this.clientFactory(this.config);

    try {
      this.client = await this.clientPromise;
      return this.client;
    } finally {
      this.clientPromise = null;
    }
  }

  private hasAuthorizationResponse(): boolean {
    const search = new URLSearchParams(this.document.location.search);
    return search.has('code') || search.has('error');
  }

  private handleAccessTokenExpired(client: OidcClient): void {
    this.currentUser.set(null);
    this.authStatus.set('unauthenticated');

    void client.removeUser().catch(() => undefined);

    const returnUrl = this.router.url;
    const path = returnUrl.split(/[?#]/, 1)[0];
    if (path !== '/admin' && !path.startsWith('/admin/')) {
      return;
    }

    if (path === '/admin/login') {
      return;
    }

    void this.router
      .navigate(['/admin/login'], {
        queryParams: { returnUrl: normalizeAdminReturnUrl(returnUrl) },
        replaceUrl: true
      })
      .catch(() => undefined);
  }

  private isValidUser(user: OidcUser | null): user is OidcUser {
    return Boolean(user && user.expired === false && (user.access_token || user.id_token));
  }

  private async clearInvalidUser(): Promise<void> {
    if (this.client) {
      try {
        await this.client.removeUser();
      } catch {
        // Invalid persisted state is treated as signed out even when cleanup fails.
      }
    }

    this.currentUser.set(null);
    this.authStatus.set('unauthenticated');
  }

  private finishAuthorizationRedirect(state: unknown): void {
    const returnUrl =
      typeof state === 'object' && state !== null && 'returnUrl' in state
        ? normalizeAdminReturnUrl((state as { returnUrl: unknown }).returnUrl)
        : DEFAULT_ADMIN_RETURN_URL;
    const baseUrl = new URL(this.document.baseURI);
    const cleanUrl = `${baseUrl.pathname}${baseUrl.search}#${returnUrl}`;

    this.document.defaultView?.history.replaceState({}, '', cleanUrl);
  }

  private finishFailedAuthorizationRedirect(): void {
    const baseUrl = new URL(this.document.baseURI);
    const cleanUrl = `${baseUrl.pathname}${baseUrl.search}#/admin/login`;

    this.document.defaultView?.history.replaceState({}, '', cleanUrl);
  }
}
