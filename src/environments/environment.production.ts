import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  // Replace with the deployed Worker URL for production builds.
  assistantApiBaseUrl: 'https://REPLACE_ME.workers.dev',
  // Keep gift cards local until the admin panel can list and manage API-backed requests.
  // Enabling the API now could persist a request that the admin panel cannot display.
  giftCardDataMode: 'local',
  bellaMujerApiBaseUrl: 'https://k6tjphkkg2.execute-api.us-east-1.amazonaws.com',
  authMode: 'cognito',
  cognito: {
    authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_HNUyVXpqJ',
    clientId: '39hc7gm44nsd4m8bo1an9upg39',
    hostedUiDomain:
      'https://bella-mujer-admin-492711534938-us-east-1.auth.us-east-1.amazoncognito.com',
  },
};
