# Phase 3 Backend, Auth, and Database Architecture

This document plans how Bella Mujer Studio can evolve from a localStorage gift-card MVP into a real production system that Alejandra can use from any device. It is intentionally planning-only: no app code, AWS resources, auth implementation, database, or Mercado Pago integration are added in this phase.

## 1. Current State

- The Angular frontend is hosted as a static application.
- The public gift-card route is `/tarjeta-regalo`.
- The admin gift-card route is `/tarjetas-regalo`.
- Gift cards are currently stored in browser localStorage using the key `bm_state_v1`.
- Admin routes are not protected yet, so anyone who can reach the route can view the admin experience.
- Phase 1 and Phase 2 are useful MVPs for validating the gift-card workflow, Spanish UX, and MXN handling, but they are not production-grade because data is device-local and there is no real authentication, backend, or payment confirmation system.
- The only backend-like code currently present is the Cloudflare Worker used for the assistant endpoint.

## 2. Goals

- Alejandra can log in securely before accessing admin screens.
- Admin data persists across devices instead of being tied to one browser.
- Public gift-card requests can be saved server-side.
- Alejandra can confirm, deliver, mark as used, and edit gift cards from any device.
- The backend can later support Mercado Pago webhook processing.
- Keep the architecture low-cost, practical, and simple to operate.
- Preserve the existing Spanish (Mexico) and MXN-based user experience.
- Create a foundation that can later support clients, appointments, inventory, transactions, and assistant data.

## 3. Non-Goals

- Do not implement Mercado Pago in Phase 3A.
- Do not build a client self-service portal yet.
- Do not design this as a multi-tenant SaaS platform.
- Do not migrate all salon modules in the first backend PR.
- Do not publicly expose admin APIs.
- Do not remove localStorage behavior during the first backend transition.

## 4. Architecture Options

### Option A: AWS Serverless

**Shape**

- Angular hosted on GitHub Pages or a custom domain.
- Amazon Cognito for authentication.
- API Gateway HTTP API for REST endpoints.
- AWS Lambda with Node.js/TypeScript for backend logic.
- DynamoDB for persistence.
- AWS CDK for infrastructure as code.
- Future Mercado Pago webhook endpoint through API Gateway and Lambda.

**Pros**

- Strong fit for protected APIs and structured auth.
- Cognito can issue JWTs that API Gateway can validate.
- Lambda and API Gateway are familiar patterns for payment webhook workflows.
- DynamoDB is serverless, durable, and cost-effective at small scale.
- CDK makes the architecture reproducible and reviewable.
- Scales naturally if the salon adds more backend workflows later.

**Cons**

- More moving parts than a single Worker and database.
- Cognito can feel heavy for a one-admin app.
- CDK and AWS IAM require careful setup.
- Local development and deployment pipelines need a little more ceremony.

**Cost/Complexity Considerations**

- Expected early usage should fit comfortably in low-cost serverless tiers.
- The main complexity is not runtime cost; it is AWS setup, IAM, deployment, and environment management.
- Billing alerts should be configured before production use.

**Fit for This Project**

- Very good fit if Bella Mujer Studio is expected to grow beyond gift cards into appointments, clients, inventory, payments, and assistant-backed workflows.
- Provides a clean production path while keeping the frontend static.

**Fit for Diego's Skills**

- Strong fit because it aligns with Diego's AWS Lambda, API Gateway, and CDK experience.
- Also provides useful long-term backend architecture practice.

### Option B: Cloudflare-First

**Shape**

- Angular hosted on GitHub Pages/custom domain or Cloudflare Pages.
- Cloudflare Worker for backend endpoints.
- Cloudflare D1 for relational persistence.
- Cloudflare Access or custom auth later.
- Future Mercado Pago webhook endpoint through a Worker route.

**Pros**

- Simpler deployment story if the app is already comfortable with Cloudflare Workers.
- Very low cost for small traffic.
- Fast edge deployment and good fit for lightweight APIs.
- D1 can be easier to reason about for relational salon data.
- Existing assistant Worker gives the repo a small head start.

**Cons**

- Auth story is less directly aligned with the requested owner/admin app unless Cloudflare Access is a good product fit.
- Cloudflare Access is excellent for internal access, but may be awkward if future user-facing auth grows.
- D1 and Workers are still a different operating model from AWS Lambda/CDK.
- Mercado Pago webhook implementation is possible, but the long-term learning path may be narrower if Diego wants deeper AWS practice.

**Cost/Complexity Considerations**

- Likely the cheapest and simplest operational path at first.
- Complexity can increase once custom auth, role handling, staging environments, and webhook verification are added.

**Fit for This Project**

- Good fallback if simplicity and cost matter more than AWS learning and Cognito-based auth.
- Particularly attractive if the production scope remains small and owner-only.

**Fit for Diego's Skills**

- Reasonable fit because the repo already contains Worker code.
- Less aligned with Diego's stated AWS Lambda/API Gateway/CDK trajectory.

## 5. Recommended Approach

Recommend **AWS serverless** as the primary Phase 3 architecture, while keeping **Cloudflare-first** as a viable fallback if the project later prioritizes the simplest and lowest-cost path.

AWS is recommended because it:

- Aligns with Diego's AWS Lambda, API Gateway, and CDK experience.
- Provides strong long-term backend learning value.
- Supports future payment and webhook workflows cleanly.
- Supports structured authentication with Cognito.
- Provides scalable, durable storage with DynamoDB.
- Leaves the Angular app as a static frontend while adding production-grade backend capabilities behind it.

Cloudflare-first remains a practical fallback if the team decides that a one-admin app should minimize infrastructure concepts above all else.

## 6. Proposed AWS Architecture

```text
Customer Browser
  -> Angular /tarjeta-regalo
  -> API Gateway
  -> Lambda
  -> DynamoDB

Alejandra Browser
  -> Cognito Login
  -> Angular Admin /tarjetas-regalo
  -> API Gateway
  -> Lambda
  -> DynamoDB

Mercado Pago Webhook (future)
  -> API Gateway
  -> Lambda
  -> DynamoDB
```

Suggested deployment boundaries:

- Frontend remains a static Angular build.
- API is versioned separately from the frontend.
- CDK owns API Gateway, Lambda, DynamoDB, Cognito, IAM, and environment outputs.
- Frontend environment config receives the API base URL and Cognito settings per environment.

## 7. Proposed Data Model

The first backend table/entity should be `GiftCard`.

### GiftCard

| Field | Purpose |
| --- | --- |
| `id` | Stable backend identifier, preferably UUID or ULID. |
| `folio` | Human-friendly salon reference shown to Alejandra and customers. |
| `createdAtISO` | ISO timestamp when the request/card was created. |
| `updatedAtISO` | ISO timestamp for the latest backend update. |
| `confirmedAtISO` | ISO timestamp when payment/manual confirmation happened. |
| `deliveredAtISO` | ISO timestamp when the gift card was delivered. |
| `usedAtISO` | ISO timestamp when the gift card was redeemed. |
| `buyerName` | Name of the purchaser. |
| `buyerPhone` | Purchaser phone number. |
| `buyerEmail` | Purchaser email, if provided. |
| `recipientName` | Gift-card recipient name. |
| `recipientPhone` | Recipient phone number, if provided. |
| `amountMXN` | Gift-card amount in MXN. Store as integer pesos or cents consistently. |
| `message` | Optional gift message. |
| `paymentMethod` | Manual transfer, cash, Mercado Pago future value, or other method. |
| `status` | Workflow state such as `pending`, `confirmed`, `delivered`, `used`, or `cancelled`. |
| `notes` | Internal admin notes. |

Future entities:

- `Client`
- `Service`
- `InventoryMaterial`
- `Transaction` or `Appointment`
- `InventoryAdjustment`
- `AssistantConversation` or `AssistantEvent`

## 8. Proposed API Endpoints

### Public

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /gift-cards/request` | Public | Creates a pending gift-card request from the public page. |

### Admin

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /gift-cards` | Required | Lists gift cards for the admin screen. |
| `GET /gift-cards/{id}` | Required | Reads one gift card. |
| `POST /gift-cards` | Required | Creates a gift card manually from the admin screen. |
| `PATCH /gift-cards/{id}` | Required | Updates editable gift-card fields. |
| `PATCH /gift-cards/{id}/status` | Required | Changes workflow status, such as confirmed, delivered, used, or cancelled. |
| `PATCH /gift-cards/{id}/notes` | Required | Updates internal admin notes. |

### Future

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /webhooks/mercado-pago` | Webhook signature validation | Receives Mercado Pago events after payment integration exists. |
| `GET /dashboard/summary` | Required | Provides admin dashboard metrics. |
| `GET /clients` | Required | Lists clients. |
| `GET /inventory` | Required | Lists inventory materials. |
| `GET /transactions` | Required | Lists transactions or appointment-linked revenue records. |

## 9. Auth Model

- The public gift-card request endpoint does not require admin authentication.
- Admin endpoints require an authenticated Alejandra/admin user.
- Frontend admin routes should later use Angular route guards.
- Cognito should issue a JWT after login.
- The Angular app should send the JWT to API Gateway using the `Authorization: Bearer <token>` header.
- API Gateway should validate JWTs before invoking protected Lambda routes where possible.
- Roles can be simple at first: `owner` or `admin`.
- The first implementation can assume Alejandra is the only admin, while still modeling permissions in a way that can later support another trusted staff member.

## 10. Migration Strategy

- Keep localStorage as a fallback/demo mode during the transition.
- Introduce a gift-card data access abstraction so UI components can read from either localStorage or the API.
- Support exporting current local gift cards before moving production data to the backend.
- Optionally build a one-time import from `bm_state_v1` to the backend after Alejandra logs in.
- Start with gift cards because they have the clearest production need.
- Migrate clients, transactions, inventory, and assistant-related data later after the backend pattern is proven.

## 11. Security and Privacy Notes

- Do not expose API keys or backend secrets in the Angular frontend.
- Protect all admin APIs with authenticated access.
- Validate and sanitize public gift-card request payloads.
- Avoid storing unnecessary sensitive data.
- Treat phone numbers as personal data and protect them accordingly.
- Use least-privilege IAM policies for Lambda, DynamoDB, logs, and deployment roles.
- Configure CORS only for allowed frontend domains.
- Do not trust a screenshot receipt as final payment confirmation.
- Until Mercado Pago webhooks exist, final payment confirmation remains manual.
- Add request size limits and basic abuse protection for public endpoints.
- Keep logs useful but avoid logging full personal data payloads.

## 12. Testing Strategy

- Frontend unit tests for gift-card data adapters, route guards, and admin state handling.
- Playwright E2E tests for public request flow and protected admin behavior.
- Backend unit tests for Lambda handlers, validators, status transitions, and persistence services.
- API contract tests for request/response shapes.
- Auth and permission tests to verify public endpoints stay public and admin endpoints reject unauthenticated calls.
- Future Mercado Pago webhook signature tests before trusting payment events.
- Smoke test the deployed API after each environment deployment.

## 13. Implementation Phases After This Doc

- **Phase 3B:** Backend scaffold with CDK, API Gateway, Lambda, and DynamoDB for gift cards.
- **Phase 3C:** Frontend API client, environment config, and local/API gift-card adapter.
- **Phase 3D:** Cognito auth and protected Angular admin routes.
- **Phase 3E:** Server-side gift-card request persistence from `/tarjeta-regalo`.
- **Phase 3F:** Deployment, domain, CORS, logging, and security hardening.
- **Phase 4:** Mercado Pago integration, including webhook validation and payment-driven status updates.

## 14. Open Questions

- What is the final production domain name?
- Will Alejandra be the only admin initially?
- Who owns the AWS account, and should billing alerts be created before deployment?
- Should localStorage demo mode remain available after production backend launch?
- Should WhatsApp communication remain manual after the backend is added?
- Is the Mercado Pago account ready for developer credentials, webhook configuration, and production review?
