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
    expect(table.Properties.GlobalSecondaryIndexes).toBeUndefined();
    expect(table.Properties.LocalSecondaryIndexes).toBeUndefined();
  });

  it('defines an HTTP API with an explicit default frontend allow-list', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
      CorsConfiguration: {
        AllowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
        AllowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
        AllowOrigins: [
          'http://localhost:4200',
          'https://diegoaranab.github.io'
        ]
      }
    });
    template.resourcePropertiesCountIs('AWS::Lambda::Function', {}, 4);

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
    template.resourcePropertiesCountIs('AWS::Logs::LogGroup', { RetentionInDays: 14 }, 4);
  });

  it('uses the existing Cognito pool and SPA client for a JWT authorizer', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1);
    template.resourcePropertiesCountIs('AWS::Lambda::Function', {}, 4);

    const [[userPoolLogicalId]] = Object.entries(
      template.findResources('AWS::Cognito::UserPool')
    );
    const [[userPoolClientLogicalId]] = Object.entries(
      template.findResources('AWS::Cognito::UserPoolClient')
    );
    const [authorizer] = Object.values(
      template.findResources('AWS::ApiGatewayV2::Authorizer')
    );

    expect(authorizer.Properties).toMatchObject({
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
      JwtConfiguration: {
        Audience: [{ Ref: userPoolClientLogicalId }]
      }
    });
    expect(JSON.stringify(authorizer.Properties.JwtConfiguration.Issuer)).toContain(
      userPoolLogicalId
    );
  });

  it('exposes exactly two public routes and three protected admin routes', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 5);

    const routes = Object.values(template.findResources('AWS::ApiGatewayV2::Route'));
    const routesByKey = Object.fromEntries(
      routes.map((route) => [route.Properties.RouteKey, route.Properties])
    );
    const [[authorizerLogicalId]] = Object.entries(
      template.findResources('AWS::ApiGatewayV2::Authorizer')
    );

    expect(Object.keys(routesByKey).sort()).toEqual([
      'GET /admin/gift-cards',
      'GET /admin/health',
      'GET /health',
      'PATCH /admin/gift-cards/{id}',
      'POST /gift-cards/request'
    ]);
    expect(routesByKey['GET /health']).toMatchObject({ AuthorizationType: 'NONE' });
    expect(routesByKey['GET /health'].AuthorizationScopes).toBeUndefined();
    expect(routesByKey['POST /gift-cards/request']).toMatchObject({
      AuthorizationType: 'NONE'
    });
    expect(routesByKey['POST /gift-cards/request'].AuthorizationScopes).toBeUndefined();
    expect(routesByKey['GET /admin/health']).toMatchObject({
      AuthorizationType: 'JWT',
      AuthorizerId: { Ref: authorizerLogicalId },
      AuthorizationScopes: ['openid']
    });
    expect(routesByKey['GET /admin/gift-cards']).toMatchObject({
      AuthorizationType: 'JWT',
      AuthorizerId: { Ref: authorizerLogicalId },
      AuthorizationScopes: ['openid']
    });
    expect(routesByKey['PATCH /admin/gift-cards/{id}']).toMatchObject({
      AuthorizationType: 'JWT',
      AuthorizerId: { Ref: authorizerLogicalId },
      AuthorizationScopes: ['openid']
    });
  });

  it('does not create VPC, NAT, EC2, or RDS resources', () => {
    template.resourceCountIs('AWS::EC2::VPC', 0);
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
    template.resourceCountIs('AWS::EC2::Instance', 0);
    template.resourceCountIs('AWS::RDS::DBInstance', 0);
    template.resourceCountIs('AWS::RDS::DBCluster', 0);
  });

  it('keeps strict DynamoDB permissions separated by Lambda responsibility', () => {
    const [[tableLogicalId]] = Object.entries(
      template.findResources('AWS::DynamoDB::Table')
    );

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
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'dynamodb:UpdateItem',
            Effect: 'Allow',
            Resource: Match.arrayWith([
              { 'Fn::GetAtt': [tableLogicalId, 'Arn'] }
            ])
          })
        ])
      }
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'dynamodb:Scan',
            Effect: 'Allow',
            Resource: Match.arrayWith([
              { 'Fn::GetAtt': [tableLogicalId, 'Arn'] }
            ])
          })
        ])
      }
    });

    const dynamodbActions = Object.values(template.findResources('AWS::IAM::Policy')).flatMap(
      (policy) =>
        policy.Properties.PolicyDocument.Statement.filter(
          (statement: { Action?: string | string[] }) => {
            const actions = typeof statement.Action === 'string'
              ? [statement.Action]
              : statement.Action ?? [];
            return actions.some((action) => action.startsWith('dynamodb:'));
          }
        ).map((statement: { Action: string | string[] }) => statement.Action)
    );

    expect(dynamodbActions).toEqual(expect.arrayContaining([
      ['dynamodb:PutItem', 'dynamodb:GetItem'],
      'dynamodb:Scan',
      'dynamodb:UpdateItem'
    ]));
    expect(dynamodbActions).toHaveLength(3);

    const lambdaFunctions = Object.values(template.findResources('AWS::Lambda::Function'));
    const roleForDescription = (description: string): string => {
      const lambdaFunction = lambdaFunctions.find(
        (resource) => resource.Properties.Description === description
      );
      expect(lambdaFunction).toBeDefined();
      return lambdaFunction!.Properties.Role['Fn::GetAtt'][0];
    };
    const actionsForRole = (roleLogicalId: string): string[] =>
      Object.values(template.findResources('AWS::IAM::Policy')).flatMap((policy) =>
        policy.Properties.Roles.some((role: { Ref?: string }) => role.Ref === roleLogicalId)
          ? policy.Properties.PolicyDocument.Statement.flatMap(
            (statement: { Action?: string | string[] }) => statement.Action ?? []
          )
          : []
      ).filter((action: string) => action.startsWith('dynamodb:')).sort();

    expect(actionsForRole(roleForDescription('Creates public pending gift-card requests'))).toEqual([
      'dynamodb:GetItem',
      'dynamodb:PutItem'
    ]);
    expect(actionsForRole(roleForDescription(
      'Lists gift cards for authenticated administrators'
    ))).toEqual(['dynamodb:Scan']);
    expect(actionsForRole(roleForDescription(
      'Updates gift-card status and notes for authenticated administrators'
    ))).toEqual(['dynamodb:UpdateItem']);
  });
});
