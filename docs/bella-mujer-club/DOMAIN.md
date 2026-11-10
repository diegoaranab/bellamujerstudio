# Bella Mujer Club conceptual domain

This document defines product concepts and invariants and records the physical persistence architecture selected in Phase 2. Phase 2 is deployed successfully in production. The first incremental Phase 3 slice adds protected administrator client creation and reads; visits, loyalty computation, and ledger/history APIs remain a later slice.

## Domain boundaries

**CONFIRMED architecture direction** — Club is part of the Bella Mujer Studio platform but has dedicated domain records, separate from Gift Cards. Club references the canonical service catalog instead of duplicating it.

**CONFIRMED architecture direction** — New Club records are structurally aware of `studioId`, even while Bella Mujer operates as one studio.

> Tenant-aware data shape does not mean implementing SaaS.

A multi-studio/SaaS product is **FUTURE** and is not part of the current implementation plan.

## Conceptual entities

Field lists below explain intent. They are not frozen schemas.

### Studio

```text
studioId
name
status
```

The Studio scopes Club records and avoids hard-coding a single tenant into every identity.

### ClubClient

```text
clientId
studioId
name
phone
status
createdAt
updatedAt
```

Access credentials, invitation state, and session metadata should be separated from ordinary profile data where appropriate. The exact separation is an **OPEN TECHNICAL DECISION**.

### Visit

A studio-confirmed paid/eligible interaction that may contribute to loyalty.

```text
visitId
studioId
clientId
occurredAt
amountMXN
service references
eligibility amount
source
createdBy
createdAt
```

Service references point to the canonical Bella Mujer catalog. They do not copy a second Club service definition.

### LoyaltyLedgerEntry

An append-style, auditable loyalty movement. Conceptual event types may include:

```text
ELIGIBLE_SPEND_ADDED
STAMP_EARNED
STAMP_ADJUSTMENT
REWARD_REDEEMED
REFERRAL_REWARD
ADMIN_ADJUSTMENT
```

The names are illustrative and may change. This is not a required TypeScript enum.

**CONFIRMED principle** — A ledger entry captures:

- why the movement occurred;
- its visit, referral, redemption, or adjustment relationship when relevant;
- monetary and/or stamp delta;
- responsible actor or source; and
- timestamp.

### LoyaltyBalance

A derived or materialized current view may include:

```text
stampCount
eligibleSpendCarryMXN
```

It may be stored for efficient reads, but the ledger remains the audit source. A mutable balance alone is insufficient.

### Promotion

```text
promotionId
studioId
title
description
active
startsAt
endsAt
```

The promotion capability is **CONFIRMED**; its content, schedule, and detailed rules are **CONFIGURABLE**.

### RewardDefinition

A **CONFIGURABLE** definition of a monetary/value benefit or complementary service/add-on, including its qualification and validity rules. Exact economics require validation. The historical `$80` example must not be encoded as a default or invariant.

### Redemption

An auditable use of a qualified reward. It should relate the client, reward definition/version, responsible actor, time, and resulting loyalty movement.

### Referral

**FUTURE** — A relationship between referrer and referred client plus the evidence/state needed to determine whether it became effective. Qualification and rewards remain configurable and must be audited.

## Stamp calculation

### Rules

**CONFIRMED**:

1. `$300 MXN` of accumulated eligible spend earns one stamp.
2. A single visit can award at most one stamp.
3. All eligible spend not consumed for the awarded stamp remains in carry.
4. The server is authoritative for the calculation.

Conceptually, for one new eligible visit:

```text
total = carryBefore + eligibleVisitAmount

if total >= 300:
    stampsAwarded = 1
    carryAfter = total - 300
else:
    stampsAwarded = 0
    carryAfter = total
```

This deliberately subtracts at most one threshold per visit. It does not discard additional balance.

### Example A — below threshold

```text
carry before visit: $0
eligible visit amount: $250

stamp awarded: 0
carry after visit: $250
```

### Example B — carry crosses threshold

```text
carry before visit: $250
eligible visit amount: $100
total eligible: $350

stamp awarded: 1
carry after visit: $50
```

### Example C — visit cap with large carry

```text
carry before visit: $0
eligible visit amount: $800
threshold math could theoretically produce 2 stamps

stamp awarded: 1
carry after visit: $500
```

The `$500` is not discarded. It remains eligible on future visits, with the one-stamp maximum applied independently to each later visit.

## Idempotency and duplicate protection

**CONFIRMED required architecture property** — Registering or processing the same visit twice must not award loyalty twice. Future visit creation and loyalty processing endpoints must be idempotent or otherwise protected from duplicate processing.

**CONFIRMED** — QR scanning alone creates no visit and no loyalty ledger entry. The administrator deliberately confirms/registers the visit, after which server logic determines eligibility and records auditable movements.

**SELECTED IN PHASE 2** — A future visit API will use a UUID idempotency key as the immutable `visitId`, or preserve an exact one-to-one mapping. The visit stores an opaque SHA-256 request fingerprint. Conditional creation prevents duplicate visit writes; Phase 3 will compare fingerprints to distinguish safe replay from conflict.

## Security and privacy principles

The following are **CONFIRMED principles** for later implementation:

- administrator operations remain authenticated through the administrative boundary;
- member authentication is separate from administrator authentication;
- a PIN is never stored in plaintext;
- invitation/access links do not directly expose client PII;
- QR payloads contain an opaque identifier rather than raw phone or name;
- the API is authoritative for stamp computation;
- a member cannot award herself stamps or arbitrarily alter history;
- every administrative adjustment is auditable;
- sensitive tokens appear in URLs only when they are specifically designed opaque invitation/access tokens;
- operational logs avoid PII; and
- IAM follows least privilege, consistent with existing project practice.

Invitation token structure, credential derivation, session handling, expiration, recovery, and storage are **OPEN TECHNICAL DECISIONS**. They require dedicated security review before client access is implemented.

## Physical persistence boundary

**SELECTED IN PHASE 2** — Club uses one dedicated DynamoDB table, physically separate from Gift Cards, with base `pk` and `sk` attributes and no secondary indexes initially.

Client profiles form the future directory access pattern:

```text
pk = STUDIO#<studioId>
sk = CLIENT#<clientId>
```

Phase 3 can list a studio's clients with a bounded Query on that partition and `begins_with(sk, 'CLIENT#')`; it must not use Scan. Name and phone lookup remain future access-pattern decisions and do not justify a speculative index.

The initial client-management API uses the server-controlled `CLUB_STUDIO_ID=bella-mujer` configuration for this partition. HTTP clients cannot submit, select, or override `studioId`. This preserves tenant-aware records without introducing multi-tenant authorization or SaaS tenant selection. Client creation atomically writes the profile and an initial zero Balance; list reads return profiles only, while detail reads return both the profile and its existing Balance.

Phone uniqueness and canonical phone search are intentionally not implemented in this slice. The current table has no reviewed phone access pattern or index, and client listing must not Scan for duplicates.

Each client aggregate uses:

```text
pk = STUDIO#<studioId>#CLIENT#<clientId>
sk = BALANCE
sk = VISIT#<visitId>
sk = LEDGER#<occurredAtISO>#<entryId>
```

The timestamp-first ledger key supports deterministic chronological lexical queries. Physical keys contain opaque identifiers only, never client names, phone numbers, email addresses, or service names.

`BALANCE` is a materialized current-state view with an optimistic `version`; the append-style `LEDGER` remains the audit source. A visit outcome is one transaction containing an immutable conditional Visit put, immutable conditional Ledger puts, and a Balance update conditioned on its expected version. Direct core aggregate reads are strongly consistent.

No GSI or LSI is included initially because all confirmed Phase 2 access patterns are supported by the base keys. An index may be introduced later only for a reviewed Phase 3 query pattern.

Phase 2 persistence architecture is deployed successfully in production. The protected Phase 3 client APIs are not considered production-deployed until their own post-merge AWS deployment gate succeeds.
