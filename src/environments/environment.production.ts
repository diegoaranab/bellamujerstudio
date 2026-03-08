import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  // Replace with the deployed Worker URL for production builds.
  assistantApiBaseUrl: 'https://REPLACE_ME.workers.dev',
};
