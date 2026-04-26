import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import { allowedOrigins } from '../src/shared/cors';

export class BellaMujerApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const giftCardsTable = new dynamodb.Table(this, 'GiftCardsTable', {
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const sharedLambdaProps: Omit<nodejs.NodejsFunctionProps, 'entry'> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
        externalModules: ['@aws-sdk/*']
      }
    };

    const healthFunction = new nodejs.NodejsFunction(this, 'HealthFunction', {
      ...sharedLambdaProps,
      entry: 'src/handlers/health.ts',
      handler: 'handler',
      description: 'Bella Mujer Studio API health check',
      logGroup: new logs.LogGroup(this, 'HealthFunctionLogGroup', {
        logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-health`,
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    });

    const giftCardRequestFunction = new nodejs.NodejsFunction(this, 'GiftCardRequestFunction', {
      ...sharedLambdaProps,
      entry: 'src/handlers/gift-card-request.ts',
      handler: 'handler',
      description: 'Creates public pending gift-card requests',
      logGroup: new logs.LogGroup(this, 'GiftCardRequestFunctionLogGroup', {
        logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-gift-card-request`,
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      environment: {
        GIFT_CARDS_TABLE_NAME: giftCardsTable.tableName
      }
    });

    giftCardsTable.grant(giftCardRequestFunction, 'dynamodb:PutItem');

    const api = new apigwv2.HttpApi(this, 'BellaMujerHttpApi', {
      apiName: 'bella-mujer-api',
      corsPreflight: {
        allowOrigins: [...allowedOrigins],
        allowHeaders: ['content-type', 'authorization'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS
        ]
      }
    });

    api.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('HealthIntegration', healthFunction)
    });

    api.addRoutes({
      path: '/gift-cards/request',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'GiftCardRequestIntegration',
        giftCardRequestFunction
      )
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.apiEndpoint,
      description: 'HTTP API base URL'
    });

    new cdk.CfnOutput(this, 'GiftCardsTableName', {
      value: giftCardsTable.tableName,
      description: 'DynamoDB gift cards table name'
    });
  }
}
