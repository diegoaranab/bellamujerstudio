# Bella Mujer Backend

Phase 3B adds an AWS serverless scaffold for gift-card requests. Phase 3C adds optional Angular API integration, and Phase 3D adds the undeployed Cognito authentication foundation. localStorage and local auth mode remain the defaults during the transition.

## What Is Included

- AWS CDK v2 TypeScript app.
- API Gateway HTTP API.
- Conservative API Gateway throttling for the public endpoint surface.
- Lambda handlers for:
  - `GET /health`
- `POST /gift-cards/request`
- DynamoDB gift-card table with on-demand billing.
- Cognito user pool for administrator accounts, with required software-token MFA and email recovery.
- Secretless Cognito SPA client using authorization code flow and PKCE-compatible callback URLs.
- Short CloudWatch log retention.
- Local Vitest tests for validation, handlers, and stack assertions.

The DynamoDB AWS SDK client is bundled into the gift-card Lambda intentionally so runtime behavior is predictable and does not depend on the Lambda runtime's preinstalled SDK contents.

## Public request contract

`POST /gift-cards/request` requires an `Idempotency-Key` header containing a UUID-style identifier. The frontend generates one key per logical submission and reuses it after an uncertain network or server failure. A missing or malformed key returns HTTP 400. The request body requires buyer name and phone, recipient name, and a whole-peso `amountMXN` of at least 300. Optional fields are buyer email, recipient phone, and message. Maximum lengths are 120 characters for names, 30 for phones, 160 for email, and 500 for message.

The key becomes the gift-card ID. DynamoDB conditionally writes the card once. The first successful request returns HTTP 201. A replay with the same key and normalized body returns HTTP 200 with the original card, including its ID, folio, and timestamps. Reusing a key with different request data returns HTTP 409 (`IDEMPOTENCY_CONFLICT`). A successful new submission uses a fresh key. The API allows the header in CORS preflight and its Lambda has scoped PutItem and GetItem access.

This scaffold does not include protected admin API endpoints, Mercado Pago, deployment automation, or any changes to the existing assistant Worker. No users or credentials are created by CDK.

## Install

From the repository root:

```bash
npm install --prefix backend
```

## Build And Test

```bash
npm --prefix backend run build
npm --prefix backend test
```

Root convenience scripts are also available:

```bash
npm run backend:build
npm run backend:test
```

## Synthesize CDK

```bash
npm --prefix backend run synth
```

Or from the repository root:

```bash
npm run backend:synth
```

The synth command should not require AWS credentials because it only generates the CloudFormation template locally.

## Deployment Notes

Deployment is intentionally not part of this PR and no deploy is performed here. Before deploying:

- Configure an AWS Budget and billing alert.
- Review the synthesized CloudFormation template.
- Choose AWS account and region settings.
- Confirm production CORS domains.
- Configure the Angular environment with the synthesized Cognito outputs before changing `authMode` to `cognito`.
- Create owner/admin users out of band; self-sign-up is disabled.
- Add API Gateway JWT authorization when protected admin endpoints are introduced.
- Configure the Angular frontend for API mode when the endpoint is ready.
