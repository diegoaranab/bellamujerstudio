import { TestBed } from '@angular/core/testing';
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

function createClient(user: OidcUser | null): OidcClient {
  return {
    events: {
      addAccessTokenExpired: vi.fn(() => vi.fn())
    },
    getUser: vi.fn().mockResolvedValue(user),
    removeUser: vi.fn().mockResolvedValue(undefined),
    signinRedirect: vi.fn().mockResolvedValue(undefined),
    signinRedirectCallback: vi
      .fn()
      .mockResolvedValue(user ?? { access_token: '', expired: true }),
    signoutRedirect: vi.fn().mockResolvedValue(undefined)
  };
}

function configure(client: OidcClient): AuthService {
  TestBed.configureTestingModule({
    providers: [
      AuthService,
      { provide: AUTH_CONFIG, useValue: cognitoConfig },
      { provide: OIDC_CLIENT_FACTORY, useValue: async () => client }
    ]
  });

  return TestBed.inject(AuthService);
}

describe('AuthService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('restores a valid Cognito session and returns its access token', async () => {
    const client = createClient({ access_token: 'access-token', expired: false });
    const service = configure(client);

    await service.initialize();

    expect(service.isAuthenticated()).toBe(true);
    await expect(service.getToken()).resolves.toBe('access-token');
  });

  it('treats expired persisted auth state as unauthenticated and removes it', async () => {
    const client = createClient({ access_token: 'expired-token', expired: true });
    const service = configure(client);

    await service.initialize();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.status()).toBe('unauthenticated');
    expect(client.removeUser).toHaveBeenCalled();
  });

  it('treats malformed persisted auth state as unauthenticated', async () => {
    const client = createClient(null);
    vi.mocked(client.getUser).mockRejectedValue(new Error('Malformed storage'));
    const service = configure(client);

    await service.initialize();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.status()).toBe('error');
    expect(client.removeUser).toHaveBeenCalled();
  });

  it('clears frontend auth state on logout', async () => {
    const client = createClient({ access_token: 'access-token', expired: false });
    const service = configure(client);
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
