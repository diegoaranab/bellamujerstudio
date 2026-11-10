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
    template.resourceCountIs('AWS::DynamoDB::Table', 3);
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

    const giftCardsTableLogicalId = template.findOutputs('GiftCardsTableName')
      .GiftCardsTableName.Value.Ref as string;
    const table = template.findResources('AWS::DynamoDB::Table')[giftCardsTableLogicalId];
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
    template.resourcePropertiesCountIs('AWS::Lambda::Function', {}, 9);

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
    template.resourcePropertiesCountIs('AWS::Logs::LogGroup', { RetentionInDays: 14 }, 9);
  });

  it('uses the existing Cognito pool and SPA client for a JWT authorizer', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1);
    template.resourcePropertiesCountIs('AWS::Lambda::Function', {}, 9);

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

  it('exposes exactly two public routes and eleven protected admin routes', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 13);

    const routes = Object.values(template.findResources('AWS::ApiGatewayV2::Route'));
    const routesByKey = Object.fromEntries(
      routes.map((route) => [route.Properties.RouteKey, route.Properties])
    );
    const [[authorizerLogicalId]] = Object.entries(
      template.findResources('AWS::ApiGatewayV2::Authorizer')
    );

    expect(Object.keys(routesByKey).sort()).toEqual([
      'GET /admin/club/clients',
      'GET /admin/club/clients/{id}',
      'GET /admin/club/clients/{id}/access',
      'GET /admin/club/clients/{id}/ledger',
      'GET /admin/gift-cards',
      'GET /admin/health',
      'GET /health',
      'PATCH /admin/gift-cards/{id}',
      'POST /admin/club/clients',
      'POST /admin/club/clients/{id}/access/invitation',
      'POST /admin/club/clients/{id}/access/reset',
      'POST /admin/club/clients/{id}/visits',
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
    for (const routeKey of [
      'POST /admin/club/clients',
      'GET /admin/club/clients',
      'GET /admin/club/clients/{id}',
      'GET /admin/club/clients/{id}/access',
      'POST /admin/club/clients/{id}/access/invitation',
      'POST /admin/club/clients/{id}/access/reset',
      'POST /admin/club/clients/{id}/visits',
      'GET /admin/club/clients/{id}/ledger'
    ]) {
      expect(routesByKey[routeKey]).toMatchObject({
        AuthorizationType: 'JWT',
        AuthorizerId: { Ref: authorizerLogicalId },
        AuthorizationScopes: ['openid']
      });
    }
    expect(Object.keys(routesByKey).some((key) => /^\w+ \/club\/clients/.test(key))).toBe(false);
  });

  it('does not create VPC, NAT, EC2, or RDS resources', () => {
    template.resourceCountIs('AWS::EC2::VPC', 0);
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
    template.resourceCountIs('AWS::EC2::Instance', 0);
    template.resourceCountIs('AWS::RDS::DBInstance', 0);
    template.resourceCountIs('AWS::RDS::DBCluster', 0);
  });

  it('keeps strict DynamoDB permissions separated by Lambda responsibility', () => {
    const tableLogicalId = template.findOutputs('GiftCardsTableName')
      .GiftCardsTableName.Value.Ref as string;

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
    expect(dynamodbActions).toEqual(expect.arrayContaining([
      'dynamodb:PutItem',
      ['dynamodb:GetItem', 'dynamodb:Query']
    ]));
    expect(dynamodbActions).toHaveLength(11);

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
    expect(actionsForRole(roleForDescription(
      'Creates Club clients for authenticated administrators'
    ))).toEqual(['dynamodb:PutItem']);
    expect(actionsForRole(roleForDescription(
      'Reads Club clients for authenticated administrators'
    ))).toEqual(['dynamodb:GetItem', 'dynamodb:Query']);
    expect(actionsForRole(roleForDescription(
      'Registers Club visits and loyalty for authenticated administrators'
    ))).toEqual(['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem']);
    expect(actionsForRole(roleForDescription(
      'Reads Club loyalty ledger for authenticated administrators'
    ))).toEqual(['dynamodb:GetItem', 'dynamodb:Query']);
    expect(actionsForRole(roleForDescription(
      'Manages Club member access for authenticated administrators'
    ))).toEqual([
      'dynamodb:DeleteItem', 'dynamodb:GetItem', 'dynamodb:GetItem', 'dynamodb:PutItem'
    ]);

    const clubTableLogicalId = template.findOutputs('ClubTableName')
      .ClubTableName.Value.Ref as string;
    const policies = Object.values(template.findResources('AWS::IAM::Policy'));
    const dynamodbStatementsForRole = (description: string) => {
      const role = roleForDescription(description);
      const statements = policies.flatMap((policy) =>
        policy.Properties.Roles.some((candidate: { Ref?: string }) => candidate.Ref === role)
          ? policy.Properties.PolicyDocument.Statement
          : []
      ).filter((statement: { Action?: string | string[] }) => {
        const actions = typeof statement.Action === 'string' ? [statement.Action] : statement.Action ?? [];
        return actions.some((action) => action.startsWith('dynamodb:'));
      });

      return statements;
    };

    const createStatements = dynamodbStatementsForRole(
      'Creates Club clients for authenticated administrators'
    );
    expect(createStatements).toEqual([{
      Action: 'dynamodb:PutItem',
      Condition: {
        'ForAnyValue:StringEquals': {
          'dynamodb:EnclosingOperation': ['TransactWriteItems']
        }
      },
      Effect: 'Allow',
      Resource: { 'Fn::GetAtt': [clubTableLogicalId, 'Arn'] }
    }]);
    const createActions = actionsForRole(roleForDescription(
      'Creates Club clients for authenticated administrators'
    ));
    for (const forbiddenAction of [
      'dynamodb:Query',
      'dynamodb:GetItem',
      'dynamodb:Scan',
      'dynamodb:UpdateItem',
      'dynamodb:DeleteItem'
    ]) {
      expect(createActions).not.toContain(forbiddenAction);
    }
    expect(JSON.stringify(createStatements)).not.toContain(tableLogicalId);

    const readStatements = dynamodbStatementsForRole(
      'Reads Club clients for authenticated administrators'
    );
    expect(readStatements).toEqual([{
      Action: ['dynamodb:GetItem', 'dynamodb:Query'],
      Effect: 'Allow',
      Resource: [{ 'Fn::GetAtt': [clubTableLogicalId, 'Arn'] }]
    }]);
    const readActions = actionsForRole(roleForDescription(
      'Reads Club clients for authenticated administrators'
    ));
    for (const forbiddenAction of [
      'dynamodb:PutItem',
      'dynamodb:Scan',
      'dynamodb:UpdateItem',
      'dynamodb:DeleteItem'
    ]) {
      expect(readActions).not.toContain(forbiddenAction);
    }
    expect(JSON.stringify(readStatements)).not.toContain(tableLogicalId);

    const visitStatements = dynamodbStatementsForRole(
      'Registers Club visits and loyalty for authenticated administrators'
    );
    expect(visitStatements).toEqual(expect.arrayContaining([
      {
        Action: 'dynamodb:GetItem',
        Effect: 'Allow',
        Resource: [{ 'Fn::GetAtt': [clubTableLogicalId, 'Arn'] }]
      },
      {
        Action: ['dynamodb:PutItem', 'dynamodb:UpdateItem'],
        Condition: {
          'ForAnyValue:StringEquals': {
            'dynamodb:EnclosingOperation': ['TransactWriteItems']
          }
        },
        Effect: 'Allow',
        Resource: { 'Fn::GetAtt': [clubTableLogicalId, 'Arn'] }
      }
    ]));
    expect(JSON.stringify(visitStatements)).not.toContain(tableLogicalId);
    for (const forbidden of ['dynamodb:Query', 'dynamodb:Scan', 'dynamodb:DeleteItem']) {
      expect(actionsForRole(roleForDescription(
        'Registers Club visits and loyalty for authenticated administrators'
      ))).not.toContain(forbidden);
    }

    const ledgerStatements = dynamodbStatementsForRole(
      'Reads Club loyalty ledger for authenticated administrators'
    );
    expect(ledgerStatements).toEqual([{
      Action: ['dynamodb:GetItem', 'dynamodb:Query'],
      Effect: 'Allow',
      Resource: [{ 'Fn::GetAtt': [clubTableLogicalId, 'Arn'] }]
    }]);
    expect(JSON.stringify(ledgerStatements)).not.toContain(tableLogicalId);
    for (const forbidden of [
      'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Scan'
    ]) expect(actionsForRole(roleForDescription(
      'Reads Club loyalty ledger for authenticated administrators'
    ))).not.toContain(forbidden);
  });
});
