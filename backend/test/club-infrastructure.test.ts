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
});
