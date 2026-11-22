export interface AppEnvironment {
  production: boolean;
  clubPromotionMutationsEnabled: boolean;
  assistantApiBaseUrl: string;
  giftCardDataMode: 'local' | 'api';
  bellaMujerApiBaseUrl: string;
  authMode: 'local' | 'cognito';
  cognito: {
    authority: string;
    clientId: string;
    hostedUiDomain: string;
  };
}
