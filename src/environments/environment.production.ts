import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  // Replace with the deployed Worker URL for production builds.
  assistantApiBaseUrl: 'https://REPLACE_ME.workers.dev',
  giftCardDataMode: 'local',
  bellaMujerApiBaseUrl: '',
  // Keep GitHub Pages usable until Cognito is deployed and these public identifiers are set.
  // Transitional local mode is not production authentication.
  authMode: 'local',
  cognito: {
    authority: '',
    clientId: '',
    hostedUiDomain: '',
  },
};
