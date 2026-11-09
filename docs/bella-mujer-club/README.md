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

Existing administrative Cognito authentication remains the administrative boundary. A Club member will not share an administrative Cognito identity. The member access experience is confirmed, while its secure backend/session/token architecture is an **OPEN TECHNICAL DECISION**.

## Current implementation status

**Phase 0 — documentation only.** There is no Club production behavior, persistence, route, component, authentication mechanism, infrastructure, or deployment in this work.

The next intended step is **Phase 1 — visual foundation and a mocked Club admin shell**. It will establish reusable Bella Mujer visual primitives and the `/admin/club` experience without adding DynamoDB Club persistence or redesigning the whole application.
