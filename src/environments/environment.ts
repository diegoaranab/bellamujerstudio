import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  assistantApiBaseUrl: 'http://127.0.0.1:8787',
  giftCardDataMode: 'local',
  bellaMujerApiBaseUrl: '',
  // Transitional demo access only. This does not authenticate or authorize an admin.
  authMode: 'local',
  cognito: {
    authority: '',
    clientId: '',
    hostedUiDomain: '',
  },
};
