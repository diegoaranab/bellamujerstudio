import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import {
  FRONTEND_PRODUCTION_URLS_CONTEXT_KEY,
  resolveFrontendConfiguration
} from '../src/shared/frontend-configuration';

export class BellaMujerApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const frontend = resolveFrontendConfiguration(
      this.node.tryGetContext(FRONTEND_PRODUCTION_URLS_CONTEXT_KEY)
    );

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

    const clubTable = new dynamodb.Table(this, 'ClubTable', {
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

    const clubAccessTable = new dynamodb.Table(this, 'ClubAccessTable', {
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'expiresAtEpoch'
    });

    const clubPinPepperSecret = new secretsmanager.Secret(this, 'ClubPinPepperSecret', {
      description: 'Bella Mujer Club PIN HMAC pepper',
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const adminUserPool = new cognito.UserPool(this, 'AdminUserPool', {
      userPoolName: 'bella-mujer-admin',
      selfSignUpEnabled: false,
      signInAliases: {
        email: true
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true
        }
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7)
      },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: {
        sms: false,
        otp: true
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const adminUserPoolDomain = adminUserPool.addDomain('AdminHostedUiDomain', {
      cognitoDomain: {
        domainPrefix: `bella-mujer-admin-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`
      }
    });

    const adminUserPoolClient = adminUserPool.addClient('AdminSpaClient', {
      userPoolClientName: 'bella-mujer-admin-spa',
      generateSecret: false,
      preventUserExistenceErrors: true,
      authFlows: {
        userSrp: true
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: {
          authorizationCodeGrant: true
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE
        ],
        callbackUrls: frontend.urls,
        logoutUrls: frontend.urls
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      enableTokenRevocation: true
    });

    const sharedLambdaProps: Omit<nodejs.NodejsFunctionProps, 'entry'> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22'
      },
      environment: {
        ALLOWED_FRONTEND_ORIGINS: frontend.origins.join(',')
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
        ...sharedLambdaProps.environment,
        GIFT_CARDS_TABLE_NAME: giftCardsTable.tableName
      }
    });

    giftCardsTable.grant(giftCardRequestFunction, 'dynamodb:PutItem', 'dynamodb:GetItem');

    const adminGiftCardsFunction = new nodejs.NodejsFunction(this, 'AdminGiftCardsFunction', {
      ...sharedLambdaProps,
      entry: 'src/handlers/admin-gift-cards.ts',
      handler: 'handler',
      description: 'Lists gift cards for authenticated administrators',
      logGroup: new logs.LogGroup(this, 'AdminGiftCardsFunctionLogGroup', {
        logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-admin-gift-cards`,
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      environment: {
        ...sharedLambdaProps.environment,
        GIFT_CARDS_TABLE_NAME: giftCardsTable.tableName
      }
    });

    giftCardsTable.grant(adminGiftCardsFunction, 'dynamodb:Scan');

    const adminGiftCardUpdateFunction = new nodejs.NodejsFunction(
      this,
      'AdminGiftCardUpdateFunction',
      {
        ...sharedLambdaProps,
        entry: 'src/handlers/admin-gift-card-update.ts',
        handler: 'handler',
        description: 'Updates gift-card status and notes for authenticated administrators',
        logGroup: new logs.LogGroup(this, 'AdminGiftCardUpdateFunctionLogGroup', {
          logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-admin-gift-card-update`,
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        environment: {
          ...sharedLambdaProps.environment,
          GIFT_CARDS_TABLE_NAME: giftCardsTable.tableName
        }
      }
    );

    giftCardsTable.grant(adminGiftCardUpdateFunction, 'dynamodb:UpdateItem');

    const clubLambdaEnvironment = {
      ...sharedLambdaProps.environment,
      CLUB_TABLE_NAME: clubTable.tableName,
      CLUB_STUDIO_ID: 'bella-mujer'
    };

    const adminClubClientCreateFunction = new nodejs.NodejsFunction(
      this,
      'AdminClubClientCreateFunction',
      {
        ...sharedLambdaProps,
        entry: 'src/handlers/admin-club-client-create.ts',
        handler: 'handler',
        description: 'Creates Club clients for authenticated administrators',
        logGroup: new logs.LogGroup(this, 'AdminClubClientCreateFunctionLogGroup', {
          logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-admin-club-client-create`,
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        environment: clubLambdaEnvironment
      }
    );

    adminClubClientCreateFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:PutItem'],
      resources: [clubTable.tableArn],
      conditions: {
        'ForAnyValue:StringEquals': {
          'dynamodb:EnclosingOperation': ['TransactWriteItems']
        }
      }
    }));

    const adminClubClientsFunction = new nodejs.NodejsFunction(
      this,
      'AdminClubClientsFunction',
      {
        ...sharedLambdaProps,
        entry: 'src/handlers/admin-club-clients.ts',
        handler: 'handler',
        description: 'Reads Club clients for authenticated administrators',
        logGroup: new logs.LogGroup(this, 'AdminClubClientsFunctionLogGroup', {
          logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-admin-club-clients`,
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        environment: clubLambdaEnvironment
      }
    );

    clubTable.grant(adminClubClientsFunction, 'dynamodb:GetItem', 'dynamodb:Query');

    const adminClubVisitCreateFunction = new nodejs.NodejsFunction(
      this,
      'AdminClubVisitCreateFunction',
      {
        ...sharedLambdaProps,
        entry: 'src/handlers/admin-club-visit-create.ts',
        handler: 'handler',
        description: 'Registers Club visits and loyalty for authenticated administrators',
        logGroup: new logs.LogGroup(this, 'AdminClubVisitCreateFunctionLogGroup', {
          logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-admin-club-visit-create`,
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        environment: clubLambdaEnvironment
      }
    );

    clubTable.grant(adminClubVisitCreateFunction, 'dynamodb:GetItem');
    adminClubVisitCreateFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:PutItem', 'dynamodb:UpdateItem'],
      resources: [clubTable.tableArn],
      conditions: {
        'ForAnyValue:StringEquals': {
          'dynamodb:EnclosingOperation': ['TransactWriteItems']
        }
      }
    }));

    const adminClubLedgerFunction = new nodejs.NodejsFunction(
      this,
      'AdminClubLedgerFunction',
      {
        ...sharedLambdaProps,
        entry: 'src/handlers/admin-club-ledger.ts',
        handler: 'handler',
        description: 'Reads Club loyalty ledger for authenticated administrators',
        logGroup: new logs.LogGroup(this, 'AdminClubLedgerFunctionLogGroup', {
          logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-admin-club-ledger`,
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        environment: clubLambdaEnvironment
      }
    );

    clubTable.grant(adminClubLedgerFunction, 'dynamodb:GetItem', 'dynamodb:Query');

    const adminClubAccessFunction = new nodejs.NodejsFunction(
      this,
      'AdminClubAccessFunction',
      {
        ...sharedLambdaProps,
        entry: 'src/handlers/admin-club-access.ts',
        handler: 'handler',
        description: 'Manages Club member access for authenticated administrators',
        logGroup: new logs.LogGroup(this, 'AdminClubAccessFunctionLogGroup', {
          logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-admin-club-access`,
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        environment: {
          ...clubLambdaEnvironment,
          CLUB_ACCESS_TABLE_NAME: clubAccessTable.tableName
        }
      }
    );

    clubTable.grant(adminClubAccessFunction, 'dynamodb:GetItem');
    clubAccessTable.grant(adminClubAccessFunction, 'dynamodb:GetItem');
    adminClubAccessFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:PutItem', 'dynamodb:DeleteItem'],
      resources: [clubAccessTable.tableArn],
      conditions: {
        'ForAnyValue:StringEquals': {
          'dynamodb:EnclosingOperation': ['TransactWriteItems']
        }
      }
    }));

    const memberCredentialFunction = new nodejs.NodejsFunction(
      this,
      'MemberClubCredentialFunction',
      {
        ...sharedLambdaProps,
        memorySize: 512,
        timeout: cdk.Duration.seconds(15),
        entry: 'src/handlers/member-club-auth.ts',
        handler: 'handler',
        description: 'Enrolls and authenticates Bella Mujer Club members',
        logGroup: new logs.LogGroup(this, 'MemberClubCredentialFunctionLogGroup', {
          logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-member-club-credential`,
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        environment: {
          ...sharedLambdaProps.environment,
          CLUB_ACCESS_TABLE_NAME: clubAccessTable.tableName,
          CLUB_PIN_PEPPER_SECRET_ARN: clubPinPepperSecret.secretArn,
          CLUB_PIN_PEPPER_VERSION: 'v1'
        }
      }
    );

    clubAccessTable.grant(memberCredentialFunction, 'dynamodb:GetItem');
    memberCredentialFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:PutItem'],
      resources: [clubAccessTable.tableArn],
      conditions: {
        'ForAnyValue:StringEquals': {
          'dynamodb:EnclosingOperation': ['TransactWriteItems']
        }
      }
    }));
    memberCredentialFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [clubPinPepperSecret.secretArn]
    }));

    const memberLogoutFunction = new nodejs.NodejsFunction(
      this,
      'MemberClubLogoutFunction',
      {
        ...sharedLambdaProps,
        entry: 'src/handlers/member-club-logout.ts',
        handler: 'handler',
        description: 'Revokes Bella Mujer Club member sessions',
        logGroup: new logs.LogGroup(this, 'MemberClubLogoutFunctionLogGroup', {
          logGroupName: `/aws/lambda/${cdk.Stack.of(this).stackName}-member-club-logout`,
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        environment: {
          ...sharedLambdaProps.environment,
          CLUB_ACCESS_TABLE_NAME: clubAccessTable.tableName
        }
      }
    );

    clubAccessTable.grant(memberLogoutFunction, 'dynamodb:GetItem');
    memberLogoutFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:PutItem'],
      resources: [clubAccessTable.tableArn],
      conditions: {
        'ForAnyValue:StringEquals': {
          'dynamodb:EnclosingOperation': ['TransactWriteItems']
        }
      }
    }));

    const api = new apigwv2.HttpApi(this, 'BellaMujerHttpApi', {
      apiName: 'bella-mujer-api',
      corsPreflight: {
        allowOrigins: frontend.origins,
        allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.OPTIONS
        ]
      }
    });

    const defaultStage = api.defaultStage?.node.defaultChild as apigwv2.CfnStage | undefined;
    defaultStage?.addPropertyOverride('DefaultRouteSettings.ThrottlingRateLimit', 5);
    defaultStage?.addPropertyOverride('DefaultRouteSettings.ThrottlingBurstLimit', 20);
    defaultStage?.addPropertyOverride('RouteSettings', {
      'POST /club/access/enroll': {
        ThrottlingRateLimit: 1,
        ThrottlingBurstLimit: 3
      },
      'POST /club/access/login': {
        ThrottlingRateLimit: 2,
        ThrottlingBurstLimit: 5
      }
    });

    const adminAuthorizer = new HttpUserPoolAuthorizer('AdminAuthorizer', adminUserPool, {
      userPoolClients: [adminUserPoolClient]
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

    api.addRoutes({
      path: '/club/access/enroll',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'MemberClubEnrollmentIntegration',
        memberCredentialFunction
      )
    });

    api.addRoutes({
      path: '/club/access/login',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'MemberClubLoginIntegration',
        memberCredentialFunction
      )
    });

    api.addRoutes({
      path: '/club/access/logout',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'MemberClubLogoutIntegration',
        memberLogoutFunction
      )
    });

    api.addRoutes({
      path: '/admin/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'AdminHealthIntegration',
        healthFunction
      ),
      authorizer: adminAuthorizer,
      authorizationScopes: ['openid']
    });

    api.addRoutes({
      path: '/admin/gift-cards',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'AdminGiftCardsIntegration',
        adminGiftCardsFunction
      ),
      authorizer: adminAuthorizer,
      authorizationScopes: ['openid']
    });

    api.addRoutes({
      path: '/admin/gift-cards/{id}',
      methods: [apigwv2.HttpMethod.PATCH],
      integration: new integrations.HttpLambdaIntegration(
        'AdminGiftCardUpdateIntegration',
        adminGiftCardUpdateFunction
      ),
      authorizer: adminAuthorizer,
      authorizationScopes: ['openid']
    });

    api.addRoutes({
      path: '/admin/club/clients',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'AdminClubClientCreateIntegration',
        adminClubClientCreateFunction
      ),
      authorizer: adminAuthorizer,
      authorizationScopes: ['openid']
    });

    api.addRoutes({
      path: '/admin/club/clients',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'AdminClubClientsIntegration',
        adminClubClientsFunction
      ),
      authorizer: adminAuthorizer,
      authorizationScopes: ['openid']
    });

    api.addRoutes({
      path: '/admin/club/clients/{id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'AdminClubClientDetailIntegration',
        adminClubClientsFunction
      ),
      authorizer: adminAuthorizer,
      authorizationScopes: ['openid']
    });

    api.addRoutes({
      path: '/admin/club/clients/{id}/visits',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'AdminClubVisitCreateIntegration',
        adminClubVisitCreateFunction
      ),
      authorizer: adminAuthorizer,
      authorizationScopes: ['openid']
    });

    api.addRoutes({
      path: '/admin/club/clients/{id}/ledger',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'AdminClubLedgerIntegration',
        adminClubLedgerFunction
      ),
      authorizer: adminAuthorizer,
      authorizationScopes: ['openid']
    });

    api.addRoutes({
      path: '/admin/club/clients/{id}/access',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'AdminClubAccessStatusIntegration',
        adminClubAccessFunction
      ),
      authorizer: adminAuthorizer,
      authorizationScopes: ['openid']
    });

    api.addRoutes({
      path: '/admin/club/clients/{id}/access/invitation',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'AdminClubAccessInvitationIntegration',
        adminClubAccessFunction
      ),
      authorizer: adminAuthorizer,
      authorizationScopes: ['openid']
    });

    api.addRoutes({
      path: '/admin/club/clients/{id}/access/reset',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'AdminClubAccessResetIntegration',
        adminClubAccessFunction
      ),
      authorizer: adminAuthorizer,
      authorizationScopes: ['openid']
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.apiEndpoint,
      description: 'HTTP API base URL'
    });

    new cdk.CfnOutput(this, 'GiftCardsTableName', {
      value: giftCardsTable.tableName,
      description: 'DynamoDB gift cards table name'
    });

    new cdk.CfnOutput(this, 'ClubTableName', {
      value: clubTable.tableName,
      description: 'DynamoDB Bella Mujer Club table name'
    });

    new cdk.CfnOutput(this, 'ClubAccessTableName', {
      value: clubAccessTable.tableName,
      description: 'DynamoDB Bella Mujer Club member-access table name'
    });

    new cdk.CfnOutput(this, 'AdminUserPoolId', {
      value: adminUserPool.userPoolId,
      description: 'Cognito user pool ID for admin authentication'
    });

    new cdk.CfnOutput(this, 'AdminUserPoolClientId', {
      value: adminUserPoolClient.userPoolClientId,
      description: 'Public Cognito SPA client ID (no client secret)'
    });

    new cdk.CfnOutput(this, 'AdminCognitoAuthority', {
      value: `https://cognito-idp.${cdk.Aws.REGION}.${cdk.Aws.URL_SUFFIX}/${adminUserPool.userPoolId}`,
      description: 'OIDC authority for admin authentication'
    });

    new cdk.CfnOutput(this, 'AdminCognitoHostedUiDomain', {
      value: adminUserPoolDomain.baseUrl(),
      description: 'Cognito Hosted UI domain for admin authentication'
    });
  }
}
