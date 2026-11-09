import { environment as developmentEnvironment } from './environment';
import { environment as productionEnvironment } from './environment.production';

describe('production environment', () => {
  it('uses the deployed Cognito and API configuration for gift cards', () => {
    expect(productionEnvironment.authMode).toBe('cognito');
    expect(productionEnvironment.cognito).toEqual({
      authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_HNUyVXpqJ',
      clientId: '39hc7gm44nsd4m8bo1an9upg39',
      hostedUiDomain:
        'https://bella-mujer-admin-492711534938-us-east-1.auth.us-east-1.amazoncognito.com',
    });
    expect(productionEnvironment.bellaMujerApiBaseUrl).toBe(
      'https://k6tjphkkg2.execute-api.us-east-1.amazonaws.com',
    );
    expect(productionEnvironment.giftCardDataMode).toBe('api');
  });

  it('keeps development authentication and gift cards local', () => {
    expect(developmentEnvironment.authMode).toBe('local');
    expect(developmentEnvironment.giftCardDataMode).toBe('local');
  });
});
