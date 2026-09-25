import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { vi } from 'vitest';

import { adminAuthGuard } from './admin-auth.guard';
import { AuthService } from './auth.service';

interface AuthStub {
  mode: 'local' | 'cognito';
  initialize: ReturnType<typeof vi.fn>;
  isAuthenticated: ReturnType<typeof vi.fn>;
}

async function runGuard(mode: 'local' | 'cognito', authenticated: boolean, url: string) {
  const redirect = { redirect: true } as unknown as UrlTree;
  const auth: AuthStub = {
    mode,
    initialize: vi.fn().mockResolvedValue(undefined),
    isAuthenticated: vi.fn(() => authenticated)
  };
  const router = {
    createUrlTree: vi.fn(() => redirect)
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router }
    ]
  });

  const result = await TestBed.runInInjectionContext(() =>
    adminAuthGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)
  );

  return { result, auth, router, redirect };
}

describe('adminAuthGuard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('allows admin navigation in transitional local mode', async () => {
    const { result, router } = await runGuard('local', false, '/admin/inicio');

    expect(result).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('allows an authenticated Cognito user', async () => {
    const { result, router } = await runGuard('cognito', true, '/admin/clientes');

    expect(result).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('redirects an unauthenticated Cognito user and preserves the return URL', async () => {
    const { result, router, redirect } = await runGuard(
      'cognito',
      false,
      '/admin/tarjetas-regalo/abc'
    );

    expect(result).toBe(redirect);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/admin/login'], {
      queryParams: { returnUrl: '/admin/tarjetas-regalo/abc' }
    });
  });
});
