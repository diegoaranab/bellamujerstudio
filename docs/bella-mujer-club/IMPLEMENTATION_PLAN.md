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

## Phase 2 — Club persistence/domain infrastructure

**Completed and deployed successfully in production.**

Implemented architecture:

- create dedicated Club persistence, separate from Gift Cards;
- use one DynamoDB table with base `pk`/`sk` keys and no secondary indexes initially;
- store the client directory in each `STUDIO#<studioId>` partition;
- store each client's immutable Visits, append-style Ledger, and materialized Balance in a per-client aggregate partition;
- make domain records tenant-aware through `studioId`;
- use consistent direct reads for core aggregate records;
- update Balance with optimistic versioning in the same transaction as Visit and Ledger writes; and
- use immutable visit identity plus a request fingerprint as the persistence half of future API idempotency.

The base-table layout supports bounded client-directory and chronological ledger Queries. A phone/name lookup index will be considered only for a reviewed future access pattern.

Tenant awareness is preparation in the data shape, not a SaaS implementation.

## Phase 3 — Protected Club admin APIs

**Completed, deployed, and production-validated.**

Phase 3 was built as small, independently testable slices.

### Client-management foundation

**Deployed successfully in production and production-smoke-tested.**

The first slice adds protected administrator APIs to:

- create a client with an atomic zero-balance aggregate;
- list client profiles through a bounded DynamoDB Query; and
- read one client profile with its Balance.

All client records are scoped by the server-controlled `CLUB_STUDIO_ID=bella-mujer` configuration. HTTP clients do not submit or select tenant identity. This is tenant-aware data scoping for the current single studio, not multi-tenant authorization. Phone uniqueness, phone/name search, QR, invitations, PINs, and member access are outside this slice.

### Visit, loyalty, and ledger slice

**Deployed successfully in production and production-smoke-tested.**

This slice adds protected administrator APIs for:

- visit registration;
- server-authoritative loyalty computation; and
- ledger/history reads.

The server-controlled `CLUB_STUDIO_ID=bella-mujer` scopes every operation. HTTP clients supply eligible spend but never compute or supply stamps, carry, balance versions, or ledger movements. The confirmed algorithm awards one stamp when accumulated eligible spend reaches `$300 MXN`, caps the result at one stamp per visit, and retains all excess carry.

`Idempotency-Key` maps one-to-one to immutable Visit identity. The same normalized request can be replayed safely without another award; conflicting reuse is rejected. Each new outcome remains one transaction containing immutable Visit and append-style Ledger puts plus an optimistic Balance update. The Ledger remains the audit source, and the history API uses a bounded, newest-first Query without Scan or secondary indexes.

QR identification, rewards, referrals, member access, and an `ADMIN_ADJUSTMENT` mutation API remain separate later capabilities.

Production validation covered authenticated visit registration, the accumulated-spend threshold, the one-stamp-per-visit cap, carry preservation, idempotent replay, ledger/history reads, and final Balance consistency. A production-only Cognito subject-validation defect discovered during smoke testing was corrected and redeployed before Phase 3 was closed.

## Phase 4 — Connect Club admin UI

**Completed.**

The operational administrator UI now uses the protected production APIs. It provides:

- client management;
- current Balance presentation;
- visit registration;
- server-authoritative loyalty outcomes; and
- auditable, paginated ledger/history.

This completed the first operational Club milestone.

## Phase 5 — Member access

Member access is deliberately split into independently reviewed slices; it must not be implemented in one PR.

### Phase 5A — Member-access security architecture

**Selected in this documentation/security-design phase.**

[MEMBER_ACCESS_SECURITY.md](./MEMBER_ACCESS_SECURITY.md) defines:

- dedicated access persistence and bounded primary-key patterns;
- opaque access handles and one-time invitations;
- 6-digit PIN policy, salted/peppered scrypt verification, and throttling;
- opaque in-memory bearer sessions for the current hosting topology;
- member authorization, IAM boundaries, reset, and revocation; and
- security threats, mitigations, and implementation sequencing.

This phase makes no code, infrastructure, or deployment changes.

### Phase 5B — Member-access persistence and backend auth foundation

Implementation status:

- **5B1 complete:** `ClubAccessTable`, persistence, crypto, and pepper foundations;
- **5B2 complete:** administrator invitation and full-reset lifecycle;
- **5B3 complete:** member enrollment, login, logout, and sessions; and
- **5B4 implemented by this PR:** the separate zero-cache member session Lambda authorizer
  and its minimal authenticated session probe.

No member UI is included. Production/security validation follows this slice before UI work.

### Phase 5C — Administrator access-management UI

**Implemented by this PR:**

- generate or regenerate access;
- copy or use the native share sheet for the one-time private activation link;
- perform full access reset; and
- present access state safely without redisplaying raw invitation secrets.

One-time activation links remain in component memory only, and lifecycle mutations are never
retried automatically. Phase 5 remains in progress until the separate Phase 5D member UI lands.

### Phase 5D — Member enrollment/login UI

**Future implementation remains:**

- create the `/club` member route;
- capture and scrub the invitation token;
- enroll and confirm a 6-digit PIN;
- perform later PIN login;
- keep the opaque session in memory only; and
- log out and revoke the session.

The confirmed experience across these slices remains:

- private invitation/access generation;
- manual WhatsApp delivery;
- 6-digit PIN enrollment;
- secure login and session handling; and
- studio-controlled reset/regeneration.

The selected architecture remains separate from administrative Cognito identity. SMS/Twilio verification is **DISCARDED** and must not be migrated. WhatsApp is transport only, and QR remains separate from login.

```text
5A architecture/security decision
        ↓
5B backend persistence/auth foundation
        ↓
production/security validation
        ↓
5C admin invitation/reset UI
        ↓
5D member enrollment/login UI
        ↓
Phase 6 member Club experience
```

Each implementation slice receives its own model/reasoning recommendation, review, and validation.

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
| Client access link | Implement the Phase 5A one-time digest-stored invitation and opaque access-handle design in Phase 5B–5D. |
| 6-digit PIN | Implement the selected salted, peppered scrypt verifier with authoritative throttling; never store plaintext. |
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

Decisions still classified **OPEN TECHNICAL DECISION** become confirmed architecture only through the relevant implementation/security review. The member-access security architecture is already selected in Phase 5A. Configurable business values must remain data/configuration rather than hidden constants.
