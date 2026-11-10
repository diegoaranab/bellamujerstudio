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

  it('adds one isolated administrator access Lambda and three Cognito-protected routes', () => {
    const accessLogicalId = template.findOutputs('ClubAccessTableName')
      .ClubAccessTableName.Value.Ref as string;
    const clubLogicalId = template.findOutputs('ClubTableName')
      .ClubTableName.Value.Ref as string;
    const functions = Object.values(template.findResources('AWS::Lambda::Function'));
    const policies = Object.values(template.findResources('AWS::IAM::Policy'));
    const routes = Object.values(template.findResources('AWS::ApiGatewayV2::Route'));
    const [[authorizerLogicalId]] = Object.entries(
      template.findResources('AWS::ApiGatewayV2::Authorizer')
    );

    expect(functions).toHaveLength(9);
    expect(routes).toHaveLength(13);
    expect(template.findResources('AWS::SecretsManager::Secret')).toEqual({});
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
    for (const lambdaFunction of functions.filter((value) => !accessFunctions.includes(value))) {
      expect(lambdaFunction.Properties.Environment.Variables.CLUB_ACCESS_TABLE_NAME).toBeUndefined();
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
    expect(routes.some((route) => /^\w+ \/club\/access/.test(route.Properties.RouteKey))).toBe(false);
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
      expect(lambdaFunction.Properties.Environment.Variables.CLUB_STUDIO_ID).toBeUndefined();
    }
  });
});
