import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface GiftCardApiConfig {
  mode: 'local' | 'api';
  baseUrl: string;
}

export const GIFT_CARD_API_CONFIG = new InjectionToken<GiftCardApiConfig>('Gift card API config', {
  providedIn: 'root',
  factory: () => ({
    mode: environment.giftCardDataMode,
    baseUrl: environment.bellaMujerApiBaseUrl
  })
});
