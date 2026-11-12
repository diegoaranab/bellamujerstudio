# Bella Mujer Club blueprint

Bella Mujer Club is the loyalty experience for Bella Mujer Studio. These documents turn the decisions explored in a private, ChatGPT-created site/PWA into an implementation blueprint for the production Bella Mujer Studio platform.

The historical prototype was a product and UX prototype created largely through Ale's natural-language direction. It is valuable evidence of the desired behavior and feel, but it is not production infrastructure or code to migrate. Club will be reconstructed on the existing Angular and AWS stack, with API Gateway, Lambda, DynamoDB, and the current administrative Cognito boundary.

> Do not treat historical prototype behavior as production truth unless it is classified **CONFIRMED** in these documents.

## Status vocabulary

| Classification | Meaning |
|---|---|
| **CONFIRMED** | Accepted product behavior to preserve unless deliberately changed later. |
| **CONFIGURABLE** | Behavior or content that should eventually be editable rather than hardcoded. |
| **FUTURE** | Desired functionality after the Club core is operational. |
| **DISCARDED** | An explored approach that has intentionally been abandoned. |
| **OPEN TECHNICAL DECISION** | The product experience is known, but its implementation architecture is not selected. |

“Not confirmed” means an idea remains unapproved; it must not be treated as a requirement. Where appropriate, the documents identify such ideas as **CONFIGURABLE** or **FUTURE**.

## Documents

- [PRODUCT.md](./PRODUCT.md) — product vision, actors, business rules, scope, and capability status
- [UX.md](./UX.md) — member and administrator experience, information architecture, and visual direction
- [DOMAIN.md](./DOMAIN.md) — conceptual entities, loyalty calculation, auditability, idempotency, and security principles
- [MEMBER_ACCESS_SECURITY.md](./MEMBER_ACCESS_SECURITY.md) — selected Phase 5A member identity, invitation, PIN, session, authorization, and reset architecture
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — incremental roadmap and prototype-to-production mapping

## Platform direction

**CONFIRMED** — Club will be integrated into the real Bella Mujer Studio platform while keeping a clearly differentiated member-facing experience:

```text
Bella Mujer Studio
│
├── /admin
│   └── Bella Mujer Club
│
└── /club
    └── client/member experience
```

The paths illustrate the target product structure; this documentation change does not create routes.

Existing administrative Cognito authentication remains the administrative boundary. A Club member will not share an administrative Cognito identity. The member access experience is confirmed, and its separate backend/session/token architecture is **SELECTED IN PHASE 5A** in [MEMBER_ACCESS_SECURITY.md](./MEMBER_ACCESS_SECURITY.md).

## Current implementation status

- **Phase 0 — completed.** The product blueprint records the confirmed rules and boundaries.
- **Phase 1 — preview shell completed.** `/admin/club` established the administrator visual foundation later connected to production data in Phase 4.
- **Phase 2 — completed, deployed, and production-smoke-tested.** Dedicated Club DynamoDB persistence, aggregate keys, materialized Balance, immutable Visit records, and append-style Ledger storage are live.
- **Phase 3 — completed, deployed, and production-validated.** Protected administrator APIs now support client creation/list/detail, visit registration, server-authoritative loyalty calculation, idempotent replay, and newest-first ledger reads.
- **Phase 4 — completed.** The operational administrator UI provides client management, Balance, visit registration, server-authoritative loyalty outcomes, and auditable paginated ledger/history.
- **Phase 5 — completed, deployed, and production-validated.** Member access is live with the selected security architecture and controlled production validation complete.
- **Next roadmap work: Phase 5F — UI/UX audit and design-system consolidation.** Tooling readiness and the read-only audit precede design remediation; Phase 6 follows that consolidation.
