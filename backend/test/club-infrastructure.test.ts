import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { BellaMujerApiStack } from '../lib/bella-mujer-api-stack';

describe('Club infrastructure', () => {
  const stack = new BellaMujerApiStack(new cdk.App(), 'ClubInfrastructureTest');
  const template = Template.fromStack(stack);

  it('creates a separate retained on-demand Club table with base keys only', () => {
    const output = template.findOutputs('ClubTableName').ClubTableName;
    expect(output).toBeDefined();
    const logicalId = output.Value.Ref as string;
    const table = template.findResources('AWS::DynamoDB::Table')[logicalId];
    expect(table).toMatchObject({
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' }
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' }
        ]
      }
    });
    expect(table.Properties.GlobalSecondaryIndexes).toBeUndefined();
    expect(table.Properties.LocalSecondaryIndexes).toBeUndefined();
    expect(table.Properties.StreamSpecification).toBeUndefined();
    expect(table.Properties.TimeToLiveSpecification).toBeUndefined();
    expect(template.findOutputs('GiftCardsTableName').GiftCardsTableName.Value.Ref).not.toBe(logicalId);
  });

  it('creates exactly one isolated retained access table with TTL and no indexes', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 3);
    const accessLogicalId = template.findOutputs('ClubAccessTableName')
      .ClubAccessTableName.Value.Ref as string;
    const clubLogicalId = template.findOutputs('ClubTableName').ClubTableName.Value.Ref as string;
    const giftCardsLogicalId = template.findOutputs('GiftCardsTableName')
      .GiftCardsTableName.Value.Ref as string;
    const tables = template.findResources('AWS::DynamoDB::Table');
    const accessTable = tables[accessLogicalId];

    expect(accessLogicalId).not.toBe(clubLogicalId);
    expect(accessLogicalId).not.toBe(giftCardsLogicalId);
    expect(accessTable).toMatchObject({
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' }
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' }
        ],
        TimeToLiveSpecification: {
          AttributeName: 'expiresAtEpoch',
          Enabled: true
        }
      }
    });
    expect(accessTable.Properties.GlobalSecondaryIndexes).toBeUndefined();
    expect(accessTable.Properties.LocalSecondaryIndexes).toBeUndefined();
    expect(accessTable.Properties.StreamSpecification).toBeUndefined();
    expect(tables[clubLogicalId].Properties.TimeToLiveSpecification).toBeUndefined();
    expect(tables[giftCardsLogicalId].Properties.TimeToLiveSpecification).toBeUndefined();
  });

  it('keeps administrator access isolated and its three routes Cognito protected', () => {
    const accessLogicalId = template.findOutputs('ClubAccessTableName')
      .ClubAccessTableName.Value.Ref as string;
    const clubLogicalId = template.findOutputs('ClubTableName')
      .ClubTableName.Value.Ref as string;
    const functions = Object.values(template.findResources('AWS::Lambda::Function'));
    const policies = Object.values(template.findResources('AWS::IAM::Policy'));
    const routes = Object.values(template.findResources('AWS::ApiGatewayV2::Route'));
    const [authorizerLogicalId] = Object.entries(
      template.findResources('AWS::ApiGatewayV2::Authorizer')
    ).find(([, resource]) => resource.Properties.AuthorizerType === 'JWT')!;

    expect(functions).toHaveLength(13);
    expect(routes).toHaveLength(17);
    const accessFunctions = functions.filter((lambdaFunction) =>
      lambdaFunction.Properties.Description ===
        'Manages Club member access for authenticated administrators'
    );
    expect(accessFunctions).toHaveLength(1);
    expect(accessFunctions[0].Properties.Environment.Variables).toMatchObject({
      CLUB_ACCESS_TABLE_NAME: { Ref: accessLogicalId },
      CLUB_TABLE_NAME: { Ref: clubLogicalId },
      CLUB_STUDIO_ID: 'bella-mujer'
    });
    for (const lambdaFunction of functions.filter((value) =>
      !accessFunctions.includes(value) && ![
        'Enrolls and authenticates Bella Mujer Club members',
        'Revokes Bella Mujer Club member sessions',
        'Authorizes Bella Mujer Club member sessions'
      ].includes(value.Properties.Description)
    )) {
      expect(lambdaFunction.Properties.Environment?.Variables?.CLUB_ACCESS_TABLE_NAME).toBeUndefined();
    }

    const routesByKey = Object.fromEntries(
      routes.map((route) => [route.Properties.RouteKey, route.Properties])
    );
    for (const routeKey of [
      'GET /admin/club/clients/{id}/access',
      'POST /admin/club/clients/{id}/access/invitation',
      'POST /admin/club/clients/{id}/access/reset'
    ]) {
      expect(routesByKey[routeKey]).toMatchObject({
        AuthorizationType: 'JWT',
        AuthorizerId: { Ref: authorizerLogicalId },
        AuthorizationScopes: ['openid']
      });
    }
    for (const routeKey of [
      'POST /club/access/enroll', 'POST /club/access/login', 'POST /club/access/logout'
    ]) expect(routesByKey[routeKey]).toMatchObject({ AuthorizationType: 'NONE' });
    expect(template.findResources('AWS::Lambda::Permission')).toBeDefined();
    expect(template.findResources('AWS::ApiGatewayV2::Authorizer')).toHaveProperty(
      authorizerLogicalId
    );

    const accessRole = accessFunctions[0].Properties.Role['Fn::GetAtt'][0];
    const accessStatements = policies.flatMap((policy) =>
      policy.Properties.Roles.some((role: { Ref?: string }) => role.Ref === accessRole)
        ? policy.Properties.PolicyDocument.Statement
        : []
    ).filter((statement: { Action?: string | string[] }) => {
      const actions = typeof statement.Action === 'string' ? [statement.Action] : statement.Action ?? [];
      return actions.some((action) => action.startsWith('dynamodb:'));
    });
    expect(accessStatements).toEqual(expect.arrayContaining([
      {
        Action: 'dynamodb:GetItem', Effect: 'Allow',
        Resource: [{ 'Fn::GetAtt': [clubLogicalId, 'Arn'] }]
      },
      {
        Action: 'dynamodb:GetItem', Effect: 'Allow',
        Resource: [{ 'Fn::GetAtt': [accessLogicalId, 'Arn'] }]
      },
      {
        Action: ['dynamodb:PutItem', 'dynamodb:DeleteItem'],
        Condition: {
          'ForAnyValue:StringEquals': {
            'dynamodb:EnclosingOperation': ['TransactWriteItems']
          }
        },
        Effect: 'Allow', Resource: { 'Fn::GetAtt': [accessLogicalId, 'Arn'] }
      }
    ]));
    const serializedStatements = JSON.stringify(accessStatements);
    for (const forbidden of [
      'dynamodb:Scan', 'dynamodb:Query', 'dynamodb:UpdateItem',
      'dynamodb:BatchWriteItem', 'secretsmanager:'
    ]) expect(serializedStatements).not.toContain(forbidden);
    const clubWriteStatement = accessStatements.find((statement) =>
      JSON.stringify(statement.Resource).includes(clubLogicalId) &&
      JSON.stringify(statement.Action).includes('PutItem')
    );
    expect(clubWriteStatement).toBeUndefined();
  });

  it('creates a retained generated pepper secret and isolates member-auth IAM', () => {
    const accessLogicalId = template.findOutputs('ClubAccessTableName')
      .ClubAccessTableName.Value.Ref as string;
    const secrets = template.findResources('AWS::SecretsManager::Secret');
    expect(Object.keys(secrets)).toHaveLength(1);
    const [[secretLogicalId, secret]] = Object.entries(secrets);
    expect(secret).toMatchObject({
      DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain',
      Properties: {
        Description: 'Bella Mujer Club PIN HMAC pepper',
        GenerateSecretString: { ExcludePunctuation: true, PasswordLength: 64 }
      }
    });
    expect(JSON.stringify(template.toJSON().Outputs ?? {})).not.toContain(secretLogicalId);

    const functions = Object.values(template.findResources('AWS::Lambda::Function'));
    const credential = functions.find((value) => value.Properties.Description ===
      'Enrolls and authenticates Bella Mujer Club members');
    const logout = functions.find((value) => value.Properties.Description ===
      'Revokes Bella Mujer Club member sessions');
    expect(credential).toBeDefined();
    expect(logout).toBeDefined();
    expect(credential!.Properties).toMatchObject({ MemorySize: 512, Timeout: 15 });
    expect(credential!.Properties.Environment.Variables).toMatchObject({
      CLUB_ACCESS_TABLE_NAME: { Ref: accessLogicalId },
      CLUB_PIN_PEPPER_SECRET_ARN: { Ref: secretLogicalId },
      CLUB_PIN_PEPPER_VERSION: 'v1'
    });
    expect(logout!.Properties.Environment.Variables).toMatchObject({
      CLUB_ACCESS_TABLE_NAME: { Ref: accessLogicalId }
    });
    expect(logout!.Properties.Environment.Variables.CLUB_PIN_PEPPER_SECRET_ARN).toBeUndefined();

    const policies = Object.values(template.findResources('AWS::IAM::Policy'));
    const statementsFor = (lambdaFunction: typeof credential) => {
      const role = lambdaFunction!.Properties.Role['Fn::GetAtt'][0];
      return policies.flatMap((policy) => policy.Properties.Roles.some(
        (candidate: { Ref?: string }) => candidate.Ref === role
      ) ? policy.Properties.PolicyDocument.Statement : []);
    };
    const credentialStatements = statementsFor(credential);
    expect(credentialStatements).toEqual(expect.arrayContaining([
      {
        Action: 'dynamodb:GetItem', Effect: 'Allow',
        Resource: [{ 'Fn::GetAtt': [accessLogicalId, 'Arn'] }]
      },
      {
        Action: 'dynamodb:PutItem',
        Condition: { 'ForAnyValue:StringEquals': {
          'dynamodb:EnclosingOperation': ['TransactWriteItems']
        } },
        Effect: 'Allow', Resource: { 'Fn::GetAtt': [accessLogicalId, 'Arn'] }
      },
      {
        Action: 'secretsmanager:GetSecretValue', Effect: 'Allow',
        Resource: { Ref: secretLogicalId }
      }
    ]));
    const logoutStatements = statementsFor(logout);
    expect(JSON.stringify(logoutStatements)).not.toContain('secretsmanager:');
    const secretReaders = functions.filter((lambdaFunction) =>
      JSON.stringify(statementsFor(lambdaFunction)).includes('secretsmanager:GetSecretValue')
    );
    expect(secretReaders).toEqual([credential]);

    const stage = Object.values(template.findResources('AWS::ApiGatewayV2::Stage'))[0];
    expect(stage.Properties.RouteSettings).toEqual({
      'POST /club/access/enroll': { ThrottlingBurstLimit: 3, ThrottlingRateLimit: 1 },
      'POST /club/access/login': { ThrottlingBurstLimit: 5, ThrottlingRateLimit: 2 }
    });
    expect(template.findResources('AWS::ApiGatewayV2::Authorizer')).toHaveProperty(
      Object.keys(template.findResources('AWS::ApiGatewayV2::Authorizer'))[0]
    );
  });

  it('creates a zero-cache member authorizer and permissionless protected probe', () => {
    const accessLogicalId = template.findOutputs('ClubAccessTableName')
      .ClubAccessTableName.Value.Ref as string;
    const clubLogicalId = template.findOutputs('ClubTableName').ClubTableName.Value.Ref as string;
    const functions = Object.values(template.findResources('AWS::Lambda::Function'));
    const authorizerFunction = functions.find((resource) =>
      resource.Properties.Description === 'Authorizes Bella Mujer Club member sessions'
    );
    const probeFunction = functions.find((resource) =>
      resource.Properties.Description ===
        'Confirms authenticated Bella Mujer Club member sessions'
    );
    expect(authorizerFunction).toBeDefined();
    expect(probeFunction).toBeDefined();
    expect(authorizerFunction!.Properties.Environment.Variables).toEqual({
      CLUB_ACCESS_TABLE_NAME: { Ref: accessLogicalId }
    });
    expect(probeFunction!.Properties.Environment).toBeUndefined();

    const policies = Object.values(template.findResources('AWS::IAM::Policy'));
    const statementsFor = (lambdaFunction: NonNullable<typeof authorizerFunction>) => {
      const role = lambdaFunction.Properties.Role['Fn::GetAtt'][0];
      return policies.flatMap((policy) => policy.Properties.Roles.some(
        (candidate: { Ref?: string }) => candidate.Ref === role
      ) ? policy.Properties.PolicyDocument.Statement : []);
    };
    const authorizerStatements = statementsFor(authorizerFunction!);
    expect(authorizerStatements).toEqual([{
      Action: 'dynamodb:GetItem',
      Effect: 'Allow',
      Resource: [{ 'Fn::GetAtt': [accessLogicalId, 'Arn'] }]
    }]);
    const probeStatements = statementsFor(probeFunction!);
    expect(probeStatements).toEqual([]);
    const serializedAuthorizationBoundary = JSON.stringify({
      authorizerStatements,
      probeStatements,
      authorizerEnvironment: authorizerFunction!.Properties.Environment,
      probeEnvironment: probeFunction!.Properties.Environment
    });
    for (const forbidden of [
      'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem',
      'dynamodb:Query', 'dynamodb:Scan', 'dynamodb:TransactWriteItems',
      'secretsmanager:', 'CLUB_PIN_PEPPER', clubLogicalId
    ]) expect(serializedAuthorizationBoundary).not.toContain(forbidden);

    const authorizers = Object.entries(template.findResources('AWS::ApiGatewayV2::Authorizer'));
    expect(authorizers).toHaveLength(2);
    const [memberAuthorizerLogicalId, memberAuthorizer] = authorizers.find(([, resource]) =>
      resource.Properties.AuthorizerType === 'REQUEST'
    )!;
    const [adminAuthorizerLogicalId, adminAuthorizer] = authorizers.find(([, resource]) =>
      resource.Properties.AuthorizerType === 'JWT'
    )!;
    expect(memberAuthorizer.Properties).toMatchObject({
      AuthorizerType: 'REQUEST',
      AuthorizerPayloadFormatVersion: '2.0',
      EnableSimpleResponses: true,
      AuthorizerResultTtlInSeconds: 0,
      IdentitySource: ['$request.header.Authorization']
    });
    expect(adminAuthorizer.Properties.AuthorizerType).toBe('JWT');

    const routes = Object.values(template.findResources('AWS::ApiGatewayV2::Route'));
    const routesByKey = Object.fromEntries(
      routes.map((route) => [route.Properties.RouteKey, route.Properties])
    );
    expect(routesByKey['GET /club/access/session']).toMatchObject({
      AuthorizationType: 'CUSTOM',
      AuthorizerId: { Ref: memberAuthorizerLogicalId }
    });
    for (const routeKey of [
      'POST /club/access/enroll', 'POST /club/access/login', 'POST /club/access/logout'
    ]) expect(routesByKey[routeKey]).toMatchObject({ AuthorizationType: 'NONE' });
    for (const routeKey of [
      'GET /admin/health', 'GET /admin/club/clients',
      'POST /admin/club/clients/{id}/access/reset'
    ]) expect(routesByKey[routeKey]).toMatchObject({
      AuthorizationType: 'JWT',
      AuthorizerId: { Ref: adminAuthorizerLogicalId }
    });
  });

  it('injects the Club table and server-controlled studio only into Club Lambdas', () => {
    const clubTableLogicalId = template.findOutputs('ClubTableName').ClubTableName.Value.Ref;
    const functions = Object.values(template.findResources('AWS::Lambda::Function'));
    const clubFunctions = functions.filter((resource) => [
      'Creates Club clients for authenticated administrators',
      'Reads Club clients for authenticated administrators',
      'Registers Club visits and loyalty for authenticated administrators',
      'Reads Club loyalty ledger for authenticated administrators',
      'Manages Club member access for authenticated administrators'
    ].includes(resource.Properties.Description));

    expect(clubFunctions).toHaveLength(5);
    for (const lambdaFunction of clubFunctions) {
      expect(lambdaFunction.Properties.Environment.Variables).toMatchObject({
        CLUB_TABLE_NAME: { Ref: clubTableLogicalId },
        CLUB_STUDIO_ID: 'bella-mujer',
        ALLOWED_FRONTEND_ORIGINS: 'http://localhost:4200,https://diegoaranab.github.io'
      });
    }
    for (const lambdaFunction of functions.filter((resource) => !clubFunctions.includes(resource))) {
      expect(lambdaFunction.Properties.Environment?.Variables?.CLUB_STUDIO_ID).toBeUndefined();
    }
  });
});
