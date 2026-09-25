import { InjectionToken } from '@angular/core';

import { AppEnvironment } from '../../../environments/environment.model';
import { environment } from '../../../environments/environment';

export type AuthMode = 'local' | 'cognito';

export interface AuthConfig {
  mode: AuthMode;
  cognito: {
    authority: string;
    clientId: string;
    hostedUiDomain: string;
  };
}

export function createAuthConfig(appEnvironment: AppEnvironment): AuthConfig {
  return {
    mode: appEnvironment.authMode,
    cognito: { ...appEnvironment.cognito }
  };
}

export const AUTH_CONFIG = new InjectionToken<AuthConfig>('AUTH_CONFIG', {
  providedIn: 'root',
  factory: () => createAuthConfig(environment)
});
