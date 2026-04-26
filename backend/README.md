# Bella Mujer Backend

Phase 3B adds an AWS serverless scaffold for gift-card requests only. It is intentionally separate from the Angular frontend and does not change the current localStorage behavior.

## What Is Included

- AWS CDK v2 TypeScript app.
- API Gateway HTTP API.
- Conservative API Gateway throttling for the public endpoint surface.
- Lambda handlers for:
  - `GET /health`
  - `POST /gift-cards/request`
- DynamoDB gift-card table with on-demand billing.
- Short CloudWatch log retention.
- Local Vitest tests for validation, handlers, and stack assertions.

The DynamoDB AWS SDK client is bundled into the gift-card Lambda intentionally so runtime behavior is predictable and does not depend on the Lambda runtime's preinstalled SDK contents.

This scaffold does not include Cognito, Mercado Pago, frontend API integration, deployment automation, or any changes to the existing assistant Worker.

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
- Add Cognito/auth in a later phase before admin endpoints are introduced.
- Integrate the Angular frontend with the API in a later phase.
