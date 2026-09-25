import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { BellaMujerApiStack } from '../lib/bella-mujer-api-stack';

const synthesizeTemplate = () => {
  const app = new cdk.App();
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
  });

  it('defines an HTTP API and Lambda functions', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
      CorsConfiguration: Match.objectLike({
        AllowOrigins: Match.arrayWith([
          'http://localhost:4200',
          'https://diegoaranab.github.io',
          'https://bellamujerestudio.com'
        ])
      })
    });
    template.resourcePropertiesCountIs('AWS::Lambda::Function', {}, 2);
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
  });

  it('defines a secretless SPA client using authorization code flow', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthScopes: ['openid', 'email', 'profile'],
      CallbackURLs: [
        'http://localhost:4200/',
        'https://diegoaranab.github.io/bellamujerstudio/',
        'https://bellamujerestudio.com/'
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
