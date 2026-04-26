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
            Action: 'dynamodb:PutItem',
            Effect: 'Allow',
            Resource: Match.anyValue()
          })
        ])
      }
    });
  });
});
