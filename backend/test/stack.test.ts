import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { BellaMujerApiStack } from '../lib/bella-mujer-api-stack';

const synthesizeTemplate = (context?: Record<string, unknown>) => {
  const app = new cdk.App({ context });
  const stack = new BellaMujerApiStack(app, 'TestBellaMujerApiStack');

  return Template.fromStack(stack);
};

describe('BellaMujerApiStack', () => {
  const template = synthesizeTemplate();

  it('defines gift-card DynamoDB table with on-demand billing', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        {
          AttributeName: 'pk',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'sk',
          KeyType: 'RANGE'
        }
      ]
    });

    const [table] = Object.values(template.findResources('AWS::DynamoDB::Table'));
    expect(table).toMatchObject({
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain'
    });
  });

  it('defines an HTTP API with an explicit default frontend allow-list', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
      CorsConfiguration: {
        AllowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
        AllowMethods: ['GET', 'POST', 'OPTIONS'],
        AllowOrigins: [
          'http://localhost:4200',
          'https://diegoaranab.github.io'
        ]
      }
    });
    template.resourcePropertiesCountIs('AWS::Lambda::Function', {}, 2);

    for (const lambdaFunction of Object.values(template.findResources('AWS::Lambda::Function'))) {
      expect(lambdaFunction.Properties.Environment.Variables).toMatchObject({
        ALLOWED_FRONTEND_ORIGINS: 'http://localhost:4200,https://diegoaranab.github.io'
      });
    }
  });

  it('adds a configured production frontend to API and Cognito allow-lists', () => {
    const productionTemplate = synthesizeTemplate({
      frontendProductionUrls: 'https://studio.example.com/app/'
    });

    productionTemplate.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({
        AllowOrigins: [
          'http://localhost:4200',
          'https://diegoaranab.github.io',
          'https://studio.example.com'
        ]
      })
    });
    productionTemplate.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      CallbackURLs: [
        'http://localhost:4200/',
        'https://diegoaranab.github.io/bellamujerstudio/',
        'https://studio.example.com/app/'
      ],
      LogoutURLs: [
        'http://localhost:4200/',
        'https://diegoaranab.github.io/bellamujerstudio/',
        'https://studio.example.com/app/'
      ]
    });
  });

  it('defines an owner-only Cognito user pool with strong defaults', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: true
      },
      AccountRecoverySetting: {
        RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }]
      },
      AutoVerifiedAttributes: ['email'],
      MfaConfiguration: 'ON',
      EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
          RequireUppercase: true,
          TemporaryPasswordValidityDays: 7
        }
      },
      UsernameAttributes: ['email']
    });

    const [userPool] = Object.values(template.findResources('AWS::Cognito::UserPool'));
    expect(userPool).toMatchObject({
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain'
    });
  });

  it('defines a secretless SPA client using authorization code flow', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthScopes: ['openid', 'email', 'profile'],
      CallbackURLs: [
        'http://localhost:4200/',
        'https://diegoaranab.github.io/bellamujerstudio/'
      ],
      LogoutURLs: [
        'http://localhost:4200/',
        'https://diegoaranab.github.io/bellamujerstudio/'
      ],
      EnableTokenRevocation: true,
      ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      GenerateSecret: false,
      PreventUserExistenceErrors: 'ENABLED',
      SupportedIdentityProviders: ['COGNITO']
    });
    template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
  });

  it('outputs the Cognito identifiers required by the SPA', () => {
    template.hasOutput('AdminUserPoolId', {});
    template.hasOutput('AdminUserPoolClientId', {});
    template.hasOutput('AdminCognitoAuthority', {});
    template.hasOutput('AdminCognitoHostedUiDomain', {});
  });

  it('configures conservative default API throttling', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      DefaultRouteSettings: {
        ThrottlingRateLimit: 5,
        ThrottlingBurstLimit: 20
      }
    });
  });

  it('bounds Lambda log retention to two weeks', () => {
    template.resourcePropertiesCountIs('AWS::Logs::LogGroup', { RetentionInDays: 14 }, 2);
  });

  it('exposes only the health check and public gift-card request routes', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 2);
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'NONE',
      RouteKey: 'GET /health'
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'NONE',
      RouteKey: 'POST /gift-cards/request'
    });
  });

  it('does not create VPC, NAT, EC2, or RDS resources', () => {
    template.resourceCountIs('AWS::EC2::VPC', 0);
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
    template.resourceCountIs('AWS::EC2::Instance', 0);
    template.resourceCountIs('AWS::RDS::DBInstance', 0);
    template.resourceCountIs('AWS::RDS::DBCluster', 0);
  });

  it('grants the gift-card Lambda scoped write access to the table', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['dynamodb:PutItem', 'dynamodb:GetItem'],
            Effect: 'Allow',
            Resource: Match.anyValue()
          })
        ])
      }
    });
  });
});
