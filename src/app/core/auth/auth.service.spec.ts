import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';

import { AUTH_CONFIG, AuthConfig } from './auth-config';
import { AuthService, normalizeAdminReturnUrl } from './auth.service';
import { OIDC_CLIENT_FACTORY, OidcClient, OidcUser } from './oidc-client';

const cognitoConfig: AuthConfig = {
  mode: 'cognito',
  cognito: {
    authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_example',
    clientId: 'spa-client',
    hostedUiDomain: 'https://example.auth.us-east-1.amazoncognito.com'
  }
};

const localConfig: AuthConfig = {
  mode: 'local',
  cognito: {
    authority: '',
    clientId: '',
    hostedUiDomain: ''
  }
};

function createClient(user: OidcUser | null): OidcClient {
  return {
    events: {
      addAccessTokenExpired: vi.fn(() => vi.fn())
    },
    getUser: vi.fn().mockResolvedValue(user),
    readSigninRequestState: vi.fn().mockResolvedValue(null),
    removeUser: vi.fn().mockResolvedValue(undefined),
    signinRedirect: vi.fn().mockResolvedValue(undefined),
    signinRedirectCallback: vi
      .fn()
      .mockResolvedValue(user ?? { access_token: '', expired: true }),
    signoutRedirect: vi.fn().mockResolvedValue(undefined)
  };
}

function configure(
  client: OidcClient,
  options: {
    config?: AuthConfig;
    documentUrl?: string;
    routerUrl?: string;
  } = {}
) {
  const documentUrl = options.documentUrl ?? 'https://studio.example/app/';
  const parsedUrl = new URL(documentUrl);
  const replaceState = vi.fn();
  const document = {
    baseURI: 'https://studio.example/app/',
    location: {
      href: documentUrl,
      search: parsedUrl.search
    },
    defaultView: {
      history: { replaceState }
    }
  } as unknown as Document;
  const router = {
    url: options.routerUrl ?? '/',
    navigate: vi.fn().mockResolvedValue(true)
  };

  TestBed.configureTestingModule({
    providers: [
      AuthService,
      { provide: AUTH_CONFIG, useValue: options.config ?? cognitoConfig },
      { provide: OIDC_CLIENT_FACTORY, useValue: vi.fn(async () => client) },
      { provide: DOCUMENT, useValue: document },
      { provide: Router, useValue: router }
    ]
  });

  return { service: TestBed.inject(AuthService), router, replaceState };
}

describe('AuthService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('restores a valid Cognito session and returns its access token', async () => {
    const client = createClient({ access_token: 'access-token', expired: false });
    const { service } = configure(client);

    await service.initialize();

    expect(service.isAuthenticated()).toBe(true);
    await expect(service.getToken()).resolves.toBe('access-token');
  });

  it('treats expired persisted auth state as unauthenticated and removes it', async () => {
    const client = createClient({ access_token: 'expired-token', expired: true });
    const { service } = configure(client);

    await service.initialize();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.status()).toBe('unauthenticated');
    expect(client.removeUser).toHaveBeenCalled();
  });

  it('treats malformed persisted auth state as unauthenticated', async () => {
    const client = createClient(null);
    vi.mocked(client.getUser).mockRejectedValue(new Error('Malformed storage'));
    const { service } = configure(client);

    await service.initialize();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.status()).toBe('error');
    expect(client.removeUser).toHaveBeenCalled();
  });

  it('evicts an authenticated Cognito session from an active admin child route', async () => {
    const client = createClient({ access_token: 'access-token', expired: false });
    const { service, router } = configure(client, {
      routerUrl: '/admin/clientes?tab=recientes'
    });
    await service.initialize();

    expect(service.isAuthenticated()).toBe(true);

    const expiredCallback = vi.mocked(client.events.addAccessTokenExpired).mock.calls[0][0];
    expiredCallback();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.status()).toBe('unauthenticated');
    expect(client.removeUser).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/admin/login'], {
      queryParams: { returnUrl: '/admin/clientes?tab=recientes' },
      replaceUrl: true
    });
  });

  it('does not install Cognito expiry handling or redirect in local mode', async () => {
    const client = createClient(null);
    const { service, router } = configure(client, {
      config: localConfig,
      routerUrl: '/admin/clientes'
    });

    await service.initialize();

    expect(service.status()).toBe('local');
    expect(client.events.addAccessTokenExpired).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('ignores an unrelated code parameter on a public URL', async () => {
    const client = createClient({ access_token: 'access-token', expired: false });
    const { service, replaceState } = configure(client, {
      documentUrl: 'https://studio.example/app/?code=promotion#/tarjeta-regalo'
    });

    await service.initialize();

    expect(client.readSigninRequestState).not.toHaveBeenCalled();
    expect(client.signinRedirectCallback).not.toHaveBeenCalled();
    expect(client.getUser).toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(service.isAuthenticated()).toBe(true);
  });

  it('ignores an unrelated error parameter on a public URL', async () => {
    const client = createClient({ access_token: 'access-token', expired: false });
    const { service, replaceState } = configure(client, {
      documentUrl: 'https://studio.example/app/?error=promotion#/tarjeta-regalo'
    });

    await service.initialize();

    expect(client.readSigninRequestState).not.toHaveBeenCalled();
    expect(client.signinRedirectCallback).not.toHaveBeenCalled();
    expect(client.getUser).toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(service.isAuthenticated()).toBe(true);
  });

  it('ignores a response whose state has no pending signin transaction', async () => {
    const client = createClient({ access_token: 'access-token', expired: false });
    const { service, replaceState } = configure(client, {
      documentUrl:
        'https://studio.example/app/?code=promotion&state=unrelated-state#/tarjeta-regalo'
    });

    await service.initialize();

    expect(client.readSigninRequestState).toHaveBeenCalledWith('unrelated-state');
    expect(client.signinRedirectCallback).not.toHaveBeenCalled();
    expect(client.getUser).toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(service.isAuthenticated()).toBe(true);
  });

  it('processes a callback with a matching pending signin state', async () => {
    const client = createClient({ access_token: 'access-token', expired: false });
    vi.mocked(client.readSigninRequestState).mockResolvedValue({
      userState: { returnUrl: '/admin/clientes' }
    });
    const { service } = configure(client, {
      documentUrl: 'https://studio.example/app/?code=temporary-code&state=expected-state'
    });

    await service.initialize();

    expect(client.readSigninRequestState).toHaveBeenCalledWith('expected-state');
    expect(client.signinRedirectCallback).toHaveBeenCalled();
    expect(client.getUser).not.toHaveBeenCalled();
  });

  it('keeps OAuth errors on login with the safe original destination and error available', async () => {
    const client = createClient(null);
    vi.mocked(client.readSigninRequestState).mockResolvedValue({
      userState: { returnUrl: '/admin/tarjetas-regalo/abc' }
    });
    vi.mocked(client.signinRedirectCallback).mockRejectedValue(new Error('access_denied'));
    const { service, replaceState } = configure(client, {
      documentUrl:
        'https://studio.example/app/?error=access_denied&error_description=Denied&state=opaque#/admin/clientes'
    });

    await service.initialize();

    expect(client.signinRedirectCallback).toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(
      {},
      '',
      '/app/#/admin/login?returnUrl=%2Fadmin%2Ftarjetas-regalo%2Fabc'
    );
    expect(service.isAuthenticated()).toBe(false);
    expect(service.status()).toBe('error');
    expect(service.errorMessage()).toMatch(/sesión no es válida/i);
  });

  it('keeps failed authorization-code exchanges on a clean admin login URL', async () => {
    const client = createClient(null);
    vi.mocked(client.readSigninRequestState).mockResolvedValue({
      userState: { returnUrl: 'https://malicious.example/admin' }
    });
    vi.mocked(client.signinRedirectCallback).mockRejectedValue(new Error('Token exchange failed'));
    const { service, replaceState } = configure(client, {
      documentUrl: 'https://studio.example/app/?code=temporary-code&state=opaque'
    });

    await service.initialize();

    expect(replaceState).toHaveBeenCalledWith(
      {},
      '',
      '/app/#/admin/login?returnUrl=%2Fadmin%2Finicio'
    );
    expect(service.status()).toBe('error');
    expect(service.errorMessage()).not.toBeNull();
  });

  it('preserves successful callback behavior and restores the safe admin destination', async () => {
    const user: OidcUser = {
      access_token: 'access-token',
      expired: false,
      state: { returnUrl: '/admin/tarjetas-regalo/abc?tab=notas' }
    };
    const client = createClient(user);
    vi.mocked(client.readSigninRequestState).mockResolvedValue({
      userState: user.state
    });
    const { service, replaceState } = configure(client, {
      documentUrl: 'https://studio.example/app/?code=temporary-code&state=opaque'
    });

    await service.initialize();

    expect(service.isAuthenticated()).toBe(true);
    expect(service.errorMessage()).toBeNull();
    expect(replaceState).toHaveBeenCalledWith(
      {},
      '',
      '/app/#/admin/tarjetas-regalo/abc?tab=notas'
    );
  });

  it('clears frontend auth state on logout', async () => {
    const client = createClient({ access_token: 'access-token', expired: false });
    const { service } = configure(client);
    await service.initialize();

    await service.logout();

    expect(client.removeUser).toHaveBeenCalled();
    expect(client.signoutRedirect).toHaveBeenCalled();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.status()).toBe('unauthenticated');
  });
});

describe('normalizeAdminReturnUrl', () => {
  it('preserves an intended admin return URL', () => {
    expect(normalizeAdminReturnUrl('/admin/tarjetas-regalo/abc?tab=notas')).toBe(
      '/admin/tarjetas-regalo/abc?tab=notas'
    );
  });

  it('rejects external and recursive login return URLs', () => {
    expect(normalizeAdminReturnUrl('https://malicious.example')).toBe('/admin/inicio');
    expect(normalizeAdminReturnUrl('/admin/login')).toBe('/admin/inicio');
  });
});
