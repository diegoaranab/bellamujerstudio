import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService, normalizeAdminReturnUrl } from './auth.service';

export const adminAuthGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.initialize();

  if (auth.mode === 'local' || auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/admin/login'], {
    queryParams: { returnUrl: normalizeAdminReturnUrl(state.url) }
  });
};
