import { AppEnvironment } from '../../../environments/environment.model';
import { createAuthConfig } from './auth-config';

function environmentWithAuthMode(authMode: AppEnvironment['authMode']): AppEnvironment {
  return {
    production: false,
    assistantApiBaseUrl: '',
    giftCardDataMode: 'local',
    bellaMujerApiBaseUrl: '',
    authMode,
    cognito: {
      authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_example',
      clientId: 'spa-client',
      hostedUiDomain: 'https://example.auth.us-east-1.amazoncognito.com'
    }
  };
}

describe('createAuthConfig', () => {
  it('selects transitional local mode from the environment', () => {
    expect(createAuthConfig(environmentWithAuthMode('local')).mode).toBe('local');
  });

  it('selects Cognito mode and its public identifiers from the environment', () => {
    const config = createAuthConfig(environmentWithAuthMode('cognito'));

    expect(config.mode).toBe('cognito');
    expect(config.cognito.clientId).toBe('spa-client');
  });
});
