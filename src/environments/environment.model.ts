export interface AppEnvironment {
  production: boolean;
  assistantApiBaseUrl: string;
  giftCardDataMode: 'local' | 'api';
  bellaMujerApiBaseUrl: string;
}
