# Bella Mujer Backend

Phase 3B adds an AWS serverless scaffold for gift-card requests. Phase 3C adds optional Angular API integration, Phase 3D adds the undeployed Cognito authentication foundation, and Phase 3F.1 hardens that foundation for a deliberate future deployment. localStorage and local auth mode remain the defaults during the transition.

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

The Lambda rejects request bodies larger than 8 KiB with HTTP 413 before JSON parsing. This limit is comfortably above the maximum valid contract and is applied to decoded bytes for base64 API Gateway events. Persistence errors log only operation/request metadata; request payloads and error messages that could contain customer contact details are not logged.

## Frontend URL configuration

`src/shared/frontend-configuration.ts` is the source of truth for URLs used by the CDK stack. A default synth includes:

- `http://localhost:4200/` for development;
- `https://diegoaranab.github.io/bellamujerstudio/` for the current GitHub Pages site.

The stack derives API Gateway and Lambda CORS origins from those URLs, while Cognito uses the complete URLs for callbacks and logout. Unknown or missing request origins do not receive an `Access-Control-Allow-Origin` response header. Wildcard CORS is not used.

The final custom domain is intentionally not checked in or assumed. Before a deployment that uses one, supply its full HTTPS frontend URL through the `frontendProductionUrls` CDK context value. For example, using a placeholder host:

```bash
npm --prefix backend run synth -- -c frontendProductionUrls=https://YOUR_FINAL_HOST/
```

For multiple production URLs, use a quoted comma-separated value. Paths are allowed when the frontend is hosted below the origin, and a trailing slash is normalized automatically. Supply the same context value to every later CDK diff/deploy operation and verify the synthesized `AllowOrigins`, `CallbackURLs`, and `LogoutURLs` first. Omitting the context remains valid for local synthesis and does not invent a production domain.

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

## Pre-deployment checklist

Deployment is intentionally not part of Phase 3F.1. The following items are requirements for a later deliberate deployment; this document does not claim they have been completed.

- [ ] Confirm the intended AWS account and region before running any deployment command.
- [ ] Confirm an AWS Budget and billing alert exist in that account before deployment.
- [ ] Synthesize with the exact deployment context and review the complete CloudFormation template and IAM changes.
- [ ] Supply and verify the final frontend URL(s) through `frontendProductionUrls`; do not rely on an assumed custom domain.
- [ ] Verify API CORS origins and every Cognito callback/logout URL in the synthesized template.
- [ ] Confirm Cognito still has self-sign-up disabled and document the out-of-band admin-user creation process.
- [ ] Confirm only `GET /health` and `POST /gift-cards/request` are public. Add JWT authorization before introducing any admin API route.
- [ ] Ensure the production Angular `authMode` is `cognito`, never `local`, before protecting or exposing real admin data.
- [ ] When backend persistence is intentionally activated, ensure production `giftCardDataMode` is `api`, not `local`, and set `bellaMujerApiBaseUrl` to the deployed `ApiUrl`.
- [ ] Copy `AdminCognitoAuthority`, `AdminUserPoolClientId`, and `AdminCognitoHostedUiDomain` outputs into the production Angular configuration. `AdminUserPoolId` is also emitted for operations.
- [ ] Smoke-test `GET /health`, an allowed-origin preflight including `Idempotency-Key`, a valid gift-card request/replay, rejection of an unknown origin in browser CORS, Cognito sign-in/MFA/logout, protected admin navigation, and production-mode configuration.
- [ ] Prepare rollback and stack-removal steps. The DynamoDB table and Cognito user pool use `RETAIN`, so they survive stack deletion/replacement and require deliberate data backup, import, or manual cleanup. Lambda log groups are intentionally destroyable and retain logs for 14 days while present.

No protected admin API routes exist yet. API Gateway JWT authorization must be added before any are introduced.
