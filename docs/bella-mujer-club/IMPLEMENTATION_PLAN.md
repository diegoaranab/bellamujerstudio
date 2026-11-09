# Bella Mujer Club implementation plan

Club will be reconstructed incrementally on the production Bella Mujer Studio stack. The prior prototype supplies product and UX evidence; it does not supply production code.

## Phase 0 — Product blueprint

**Completed.**

Goal: formalize accepted prototype decisions, boundaries, unknowns, and the incremental plan before production Club code is written.

Deliverable: documentation only. No routes, components, APIs, persistence, authentication changes, infrastructure, dependencies, or deployments.

## Phase 1 — Visual foundation and Club shell

**Preview shell implemented.** The `/admin/club` experience uses demonstration-only component state and does not persist or modify Club data.

Goals:

- create reusable Bella Mujer visual primitives/tokens where appropriate;
- create a mocked Club administrator shell;
- establish the `/admin/club` visual experience;
- use the previous prototype as inspiration; and
- test a richer hierarchy without redesigning the entire application.

Boundaries: no DynamoDB Club persistence and no production mock JSON added as a substitute for a backend.

**Next: Phase 2 — Club persistence/domain infrastructure.**

## Phase 2 — Club persistence/domain infrastructure

Goals:

- create dedicated Club persistence, separate from Gift Cards;
- use DynamoDB;
- make domain records tenant-aware through `studioId`; and
- establish an auditable loyalty ledger and current-balance strategy.

**OPEN TECHNICAL DECISION** — Exact table, partition/sort-key, index, transaction, idempotency, and materialization designs are selected and reviewed in this phase. This blueprint does not freeze them.

Tenant awareness is preparation in the data shape, not a SaaS implementation.

## Phase 3 — Protected Club admin APIs

Start with small, independently testable capabilities:

- create/manage clients;
- client lookup, including opaque QR identification;
- visit registration;
- server-authoritative loyalty computation; and
- ledger/history reads.

Duplicate visit processing must not duplicate loyalty. QR lookup alone must not create visits or ledger movements.

## Phase 4 — Connect Club admin UI

Replace the shell's mocks with protected APIs. Administrators should be able to:

- create or find a client;
- register a visit;
- see the resulting stamp and eligible-spend carry;
- inspect transparent loyalty history; and
- understand the reason for every adjustment.

This is the first operational Club milestone.

## Phase 5 — Client access

Implement the confirmed member access experience:

- private invitation/access generation;
- WhatsApp delivery workflow;
- 6-digit PIN enrollment;
- secure login and session handling; and
- studio-controlled reset/regeneration.

The exact authentication, invitation, credential, and session architecture is an **OPEN TECHNICAL DECISION** and must receive a dedicated security review before implementation. It must remain separate from administrative Cognito identity.

SMS/Twilio verification is **DISCARDED** and must not be migrated.

## Phase 6 — Client Club experience

Connect real member experiences:

- Mi Club and stamp progress;
- transaction/stamp history;
- opaque identification QR; and
- active promotions.

Member screens should emphasize progress, clarity, and beauty-oriented polish rather than administration.

## Phase 7 — Rewards and promotions

After reward economics are approved:

- implement configurable promotion management;
- implement configurable reward definitions;
- support audited redemption; and
- validate rewards against the `$120 MXN/hour` average Club profitability reference.

The profitability reference is an average evaluation target, not a guaranteed per-appointment minimum. Historical `$80` and `$120` reward examples remain unapproved.

## Phase 8 — Referrals and later features

**FUTURE**, after economics and the core workflow are stable:

- referrals and audited referral rewards;
- notifications;
- appointments inside Club; and
- richer profitability and behavior analytics.

## Prototype-to-production reconstruction

| Prototype concept | Production treatment |
|---|---|
| Client directory | Rebuild against the Club backend. |
| Local/mock client records | Replace with real DynamoDB `ClubClient` records. |
| Visit/payment registration | Rebuild as a protected administrator API and UI workflow. |
| Stamp counter | Replace with an auditable ledger plus derived/materialized balance. |
| Eligible-spend carry | Calculate server-side and preserve across visits. |
| QR | Use an opaque client lookup identifier; never use it as login or automatic stamp issuance. |
| Promotions draft | Rebuild later as configurable `Promotion` data. |
| Reward configuration | Rebuild as `RewardDefinition` only after economic approval. |
| Profitability panel | Treat as later analytics, not initial core scope. |
| Client access link | Implement a secure invitation/access flow after security review. |
| 6-digit PIN | Use a secure hashed/derived credential mechanism; exact architecture is TBD. |
| Twilio verification | Do not migrate; **DISCARDED**. |
| Visual design | Preserve its spirit and rebuild through the Angular/Bella Mujer design system. |
| Prototype service copy | Reference the canonical Bella Mujer service catalog; do not duplicate/import it. |

The purpose is reconstruction, not code transplantation.

## Cross-phase quality gates

Every implementation phase should preserve these confirmed properties:

- administrative operations are authenticated;
- members cannot mutate their own loyalty;
- stamp calculation is server-authoritative;
- movements and administrative adjustments are auditable;
- duplicate processing cannot duplicate rewards;
- PII is absent from QR payloads, access URLs, and operational logs;
- access secrets and PINs are handled securely; and
- AWS permissions follow least privilege.

Decisions classified **OPEN TECHNICAL DECISION** become confirmed architecture only through the relevant implementation/security review. Configurable business values must remain data/configuration rather than hidden constants.
