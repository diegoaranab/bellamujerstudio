import { InjectionToken } from '@angular/core';

import { environment } from '../../../environments/environment';

export interface ClubApiConfig {
  baseUrl: string;
}

export const CLUB_API_CONFIG = new InjectionToken<ClubApiConfig>('Club API config', {
  providedIn: 'root',
  factory: () => ({ baseUrl: environment.bellaMujerApiBaseUrl })
});
