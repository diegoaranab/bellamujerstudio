import { DOCUMENT } from '@angular/common';
import { inject, InjectionToken } from '@angular/core';

import { AuthConfig } from './auth-config';

export interface OidcUser {
  readonly access_token: string;
  readonly id_token?: string;
  readonly expired?: boolean;
  readonly state?: unknown;
}

export interface OidcClient {
  readonly events: {
    addAccessTokenExpired(callback: () => void): () => void;
  };
  getUser(): Promise<OidcUser | null>;
  removeUser(): Promise<void>;
  signinRedirect(args: { state: { returnUrl: string } }): Promise<void>;
  signinRedirectCallback(url?: string): Promise<OidcUser>;
  signoutRedirect(): Promise<void>;
}

export type OidcClientFactory = (config: AuthConfig) => Promise<OidcClient>;

export const OIDC_CLIENT_FACTORY = new InjectionToken<OidcClientFactory>('OIDC_CLIENT_FACTORY', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);

    return async (config: AuthConfig): Promise<OidcClient> => {
      const window = document.defaultView;
      if (!window) {
        throw new Error('La autenticación requiere un navegador.');
      }

      const { UserManager, WebStorageStateStore } = await import('oidc-client-ts');
      const redirectUri = new URL(document.baseURI).toString();
      const hostedUiDomain = config.cognito.hostedUiDomain.replace(/\/$/, '');
      const manager = new UserManager({
        authority: config.cognito.authority,
        client_id: config.cognito.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        automaticSilentRenew: false,
        loadUserInfo: false,
        metadataSeed: {
          authorization_endpoint: `${hostedUiDomain}/oauth2/authorize`,
          token_endpoint: `${hostedUiDomain}/oauth2/token`,
          userinfo_endpoint: `${hostedUiDomain}/oauth2/userInfo`,
          revocation_endpoint: `${hostedUiDomain}/oauth2/revoke`,
          end_session_endpoint: `${hostedUiDomain}/logout`
        },
        userStore: new WebStorageStateStore({ store: window.sessionStorage })
      });

      return {
        events: manager.events,
        getUser: () => manager.getUser(),
        removeUser: () => manager.removeUser(),
        signinRedirect: (args) => manager.signinRedirect(args),
        signinRedirectCallback: (url) => manager.signinRedirectCallback(url),
        signoutRedirect: async () => {
          const logoutUrl = new URL(`${hostedUiDomain}/logout`);
          logoutUrl.searchParams.set('client_id', config.cognito.clientId);
          logoutUrl.searchParams.set('logout_uri', redirectUri);
          window.location.assign(logoutUrl.toString());
        }
      };
    };
  }
});
