# Phase 7A configurable promotion administration architecture

**Status: Phase 7A authority; 7A4c1 current.** 7A0 architecture, 7A1a persistence foundation, 7A1b reconciliation/capacity initialization, and 7A2 protected admin read API are complete; 7A2 is merged, deployed, production-validated, and closed. 7A3a and 7A3b are complete; 7A3c is merged, deployed, production-validated, and closed, so 7A3 is closed. 7A4a is closed. 7A4b is merged, deployed, production-validated, and closed. 7A4c1 adds gated creation; 7A4 remains open. 7A5 still owns reconciliation and mutation-route enablement after successful reconciliation. This document builds on, and does not replace, [PROMOTIONS_ARCHITECTURE.md](./PROMOTIONS_ARCHITECTURE.md). That Phase 6 authority remains canonical for the promotion row, member read, active-selection semantics, 100-row catalog, and member-facing contract. This document extends it with administrator readers and writers.

## Phase boundary

```text
Phase 6: CLOSED / PRODUCTION-COMPLETE
Phase 6E: CLOSED / PRODUCTION-VALIDATED
Phase 7: STARTING
Phase 7A: CONFIGURABLE PROMOTION ADMINISTRATION
Rewards: NOT INCLUDED / NOT ECONOMICALLY APPROVED
```

Phase 6E's controlled production validation ended with zero promotion rows after cleanup. That is evidence about the validation window, not a permanent production invariant. Phase 7A does not approve reward definitions or redemption economics.

## Compatibility with the delivered reader

The current `GET /club/me/promotions` remains unchanged. The existing member promotion Lambda is read-only and uses the validated member authorizer context, strongly queries the studio promotion partition, validates all canonical rows, and selects one eligible promotion. Phase 7A adds administrator writers while preserving this row contract and selection behavior.

The canonical `PROMOTION#<promotionId>` item remains exactly:

```text
pk
sk
entityType
studioId
promotionId
title
description
status
startsAtISO
endsAtISO
createdAtISO
updatedAtISO
```

The strict member deserializer rejects unexpected attributes. Do not add writer metadata to canonical rows, including `version`, `priority`, `targeting`, `reward`, CTA, `createdBy`, `updatedBy`, audit fields, capacity fields, or idempotency fields. Optimistic concurrency uses the existing `updatedAtISO`. Any future schema change requires a separately reviewed reader migration before writers depend on it.

Member selection remains as documented in Phase 6:

- future inactive rows are omitted;
- future active rows become visible automatically at their start instant;
- deactivation removes a row immediately;
- edits update the copy selected for members;
- schedule changes follow the existing server selection rules;
- expiry is exclusive (`now >= endsAtISO`) and does not mutate a row;
- deletion removes the row;
- among multiple eligible rows, latest `startsAtISO` wins, with lexicographically smallest `promotionId` breaking equal starts.

No member-side selection logic or member API change is part of Phase 7A.

## Capacity metadata and invariant

Use a separate metadata item in the existing `ClubTable` promotion partition:

```text
pk = STUDIO#<studioId>#PROMOTIONS
sk = CAPACITY

entityType = PROMOTION_CAPACITY
studioId
count
state
reconciledAtISO
```

The initial supported state is `READY`, and `count` is an integer from 0 through 100. The invariant is:

```text
count = number of canonical PROMOTION# rows
```

The count includes active, inactive, future, and expired promotions. `CAPACITY` is metadata: it is not a promotion, an active projection, or a member-visible row. The existing catalog limit remains 100 per studio.

## Atomic capacity mutations

Every transaction uses the existing `ClubTable`; every operation either commits fully or has no effect.

### Create

One DynamoDB transaction atomically includes:

1. conditional Put of the canonical promotion;
2. conditional capacity increment;
3. conditional Put of create-idempotency evidence; and
4. immutable audit Put.

Conditions ensure the promotion does not exist, capacity is `READY`, count is in `0..99`, and the idempotency record does not conflict. A competing create at slot 100 cannot also commit: the capacity condition and transaction serialize the competing updates so at most one can advance count from 99 to 100.

### Delete

One transaction atomically includes:

1. conditional canonical promotion Delete;
2. conditional capacity decrement; and
3. immutable delete audit Put containing the safe before-image.

Conditions ensure the promotion exists, its stored `updatedAtISO` equals `expectedUpdatedAtISO`, capacity is `READY`, and count is in `1..100`. Duplicate or competing deletes cannot decrement twice because the conditional promotion delete and count update must commit together. Hard delete frees one slot.

### Edit and status/schedule change

An update transaction includes the conditional canonical mutation and immutable audit Put. It does not mutate capacity. The promotion condition requires the persisted `updatedAtISO` to equal the caller's `expectedUpdatedAtISO`.

## Reconciliation and writer enablement gate

Before enabling any permanent writer, freeze every promotion write path, including temporary or manual operational writes. With the freeze held:

1. strongly query the complete canonical promotion prefix;
2. follow every DynamoDB page and validate every row against the strict canonical model;
3. count all valid rows and reject a count greater than 100;
4. reject malformed data and preserve the evidence for investigation;
5. if `CAPACITY` is absent, initialize it conditionally with the verified count and `READY` state;
6. if it exists, compare it with a fresh canonical count and fail closed on mismatch;
7. enable writers only after successful verification.

An interrupted reconciliation is safely rerunnable. It must not blindly overwrite capacity, truncate the catalog, or repair the count automatically from a live request. The current production evidence of zero promotion rows after Phase 6E validation cleanup is not a permanent invariant.

## Lifecycle policy

- **Create:** the server generates a lowercase UUID v4 and controls canonical timestamps. The administrator supplies content, status, and interval. The administrator UI should default a new draft to `inactive`; this is an architecture recommendation, not a hidden backend default.
- **Edit:** preserve `promotionId` and `createdAtISO`; set a server-controlled `updatedAtISO`. Active promotions may be edited. A stale editor cannot silently overwrite a newer change.
- **Activate/deactivate:** use canonical `status` (`active` or `inactive`); no extra lifecycle record is stored on the promotion.
- **Schedule:** an `active` promotion with a future start becomes member-visible automatically at its start. No scheduler is needed.
- **Expiry:** natural consequence of the member read's `now >= endsAtISO` exclusive end. Expiry performs no mutation.
- **Delete:** hard-delete the canonical item and retain a safe before-image in immutable audit. Do not add an `archived` state: the current strict reader would reject it, and no current product need justifies it.

## Audit evidence

Promotion administration audit uses a separate partition, conceptually:

```text
pk = STUDIO#<studioId>#PROMOTION_AUDIT
sk = EVENT#<timestamp>#<eventId>
```

This is not the loyalty ledger and must never appear in member transaction history. Every successful mutation writes immutable audit evidence atomically with its canonical mutation. At minimum, evidence records `studioId`, `eventId`, `promotionId`, operation, `occurredAtISO`, validated Cognito administrator `sub`, safe before state where applicable, safe after state where applicable, and an opaque request identity where applicable.

Never store bearer tokens, PINs, member sessions, raw authentication material, or unnecessary PII. Exact physical serialization can be finalized with persistence implementation if it meets these requirements, uses strict validation, and follows repository key conventions. An administrator audit-reading UI is outside the initial writer slice.

## Optimistic concurrency

PATCH and DELETE require `expectedUpdatedAtISO`. A mutation succeeds only if the persisted `updatedAtISO` equals that value. Stale writes return conceptually `409 PROMOTION_CONFLICT`; there is no silent last-write-wins behavior.

A successful update must assign a server-controlled canonical `updatedAtISO` strictly later than its prior value, even if the wall clock has not advanced by one full millisecond. Do not add a `version` attribute to the promotion row.

## Create idempotency

Create requires a stable, opaque `Idempotency-Key` for one logical creation attempt. It is not the `promotionId`. Persist durable metadata outside the canonical promotion prefix, using the existing key-validation conventions. A suitable conceptual shape is:

```text
pk = STUDIO#<studioId>#PROMOTION_IDEMPOTENCY
sk = CREATE#<sha256-of-opaque-key>

entityType = PROMOTION_CREATE_IDEMPOTENCY
studioId
requestFingerprint = <sha256-of-normalized-logical-request>
promotionId
createdAtISO
safeCreationResult
```

The raw key and raw request body are never logged. A new key and request create once; the same key and exact logical request replay the original creation result; the same key with a different request conflicts. The idempotency Put is atomic with promotion creation, capacity increment, and audit. After an uncertain transaction result, strongly read the idempotency record to determine whether creation committed before retrying. There is no expiry for promotion-create idempotency evidence in this initial architecture.

## Protected administrator API direction

The selected route direction is:

```text
GET    /admin/club/promotions
POST   /admin/club/promotions
GET    /admin/club/promotions/{promotionId}
PATCH  /admin/club/promotions/{promotionId}
DELETE /admin/club/promotions/{promotionId}
```

All routes reuse the existing administrator Cognito boundary, derive studio server-side, reject arbitrary `studioId` or `clientId` selectors, and return safe errors. List returns the complete bounded catalog. No public pagination contract is needed while the catalog is capped at 100; persistence still safely traverses every DynamoDB page. This document defines direction only; no routes are implemented here.

## IAM direction

- **Member promotion Lambda:** unchanged, read-only `Query` on the promotion partition only.
- **Admin readers:** only the promotion read access they require.
- **Admin writers:** only the `ClubTable` actions required for canonical promotion items, capacity, create-idempotency, and audit records.

Phase 7A3c provisions the mutation handler as a separate dormant writer Lambda, with transaction-scoped item permissions restricted by promotion partition keys, and adds `DELETE` to API CORS. It creates no mutation routes or API Gateway integration, so no production write path exists. Phase 7A5 owns mutation-route enablement, and may enable it only after successful reconciliation.

Do not grant promotion handlers access to `ClubAccessTable`, member credential/session secrets, Gift Cards, or unrelated loyalty mutations. Verify IAM in synth/tests and later against the target AWS environment.

## Time-zone boundary and mutation DTO

The authoritative studio timezone is exactly `America/Mexico_City`. Administrator-authored mutation DTO values use minute precision and the exact lexical form `YYYY-MM-DDTHH:mm` as local wall-clock time, with no seconds, offset, `Z`, or timezone suffix. Create editable fields are `title`, `description`, `status`, `startsAtLocal`, and `endsAtLocal`; the two local fields use this exact form. POST accepts exactly these five fields. PATCH accepts any nonempty subset of editable fields plus required `expectedUpdatedAtISO`; schedule changes require both local endpoints together. DELETE accepts exactly `expectedUpdatedAtISO`. The token is canonical UTC. Create requires an opaque `Idempotency-Key`; only its SHA-256 hash is stored. A first create returns 201 and an exact replay returns 200 with the stored creation result. A semantic PATCH no-op neither writes audit evidence nor advances `updatedAtISO`. Successful mutation responses expose only the narrow administrator promotion DTO (or the deleted identifier).

Conversion is server-side and IANA-aware using `temporal-polyfill` exactly pinned at `1.0.8`, imported through `temporal-polyfill/implementation` without installing its global shim. Calendar overflow is rejected. Ambiguous and nonexistent local times are rejected. Browser timezone, Lambda default timezone, and fixed offsets are not authoritative. Canonical persisted timestamps remain UTC in exact `YYYY-MM-DDTHH:mm:ss.sssZ` form; conversion supplies `:00.000Z` for minute-precision input. Local authoring fields remain API-boundary values and are never added to `ClubPromotion` or persisted rows.

## Failure semantics

| Condition | Conceptual result |
|---|---|
| Invalid DTO, selector, or interval | `400` validation error |
| Not authenticated / insufficient authorization | Existing `401` / `403` behavior |
| Promotion not found | `404` |
| Stale `updatedAtISO` | `409 PROMOTION_CONFLICT` |
| Capacity is 100 | `409 PROMOTION_CATALOG_FULL` |
| Exact create replay | Replay original result |
| Same idempotency key, different request | `409 IDEMPOTENCY_CONFLICT` |
| Missing or corrupt capacity | Fail closed |
| Audit write failure | Entire transaction fails |
| Unexplained transaction cancellation | Safe `500` / `503` |

Never expose DynamoDB internals, physical keys, or raw errors.

## Multi-page read limitation

A strongly consistent DynamoDB Query across multiple pages is not a transactionally point-in-time snapshot. The existing bounded catalog reader can observe a mixed traversal during concurrent writes. **Current decision: ACCEPT EXISTING LIMITATION.** Individual canonical rows remain valid, writers preserve the 100-row invariant, the reader fails closed on malformed data or budget problems, the catalog is bounded, and no observed product requirement currently justifies a projection or new table. Require concurrency and regression testing. A concrete future correctness problem may reopen this architecture.

## Rollback

Before real writer mutations, writer code/routes/permissions can be disabled or removed; unused capacity metadata may remain, and member reads continue unchanged. After real mutations, disable writers first and retain canonical promotions, capacity, audit, and idempotency evidence. Reconcile under a write freeze before re-enabling. Do not roll back by deleting metadata or restoring stale promotion content.

## Implementation slices

The completed analysis left overall uncertainty **MEDIUM**. Keep implementation decomposed to reduce uncertainty and review each slice independently:

| Slice | Scope |
|---|---|
| **7A0 — architecture authority (this document)** | Durable decisions before implementation. |
| **7A1a — promotion persistence foundation** | Capacity, audit, and create-idempotency models/keys; canonical UTC transactional persistence; optimistic concurrency. No HTTP routes, timezone library, or exposed writer. |
| **7A1b — reconciliation / capacity initialization** | Bounded canonical traversal; initialization and verification; rerunnable fail-closed behavior. No public/admin writer enabled. |
| **7A2 — protected admin read API** | List/detail and IAM; no mutation. |
| **7A3 — admin mutation API** | 7A3a local-time/DTO foundation and 7A3b handler are complete. 7A3c provisions dormant writer infrastructure and DELETE CORS without routes or integration. 7A3 is merged, deployed, production-validated, and closed. |
| **7A4a — administrator promotion API client** | Frontend TypeScript contracts and validated client methods only; closed. |
| **7A4c1 — gated creation** | Compile-time capability guards create UX; production capability remains false. Only 7A5 may enable it after successful reconciliation and mutation-route enablement. |
| **7A4 — administrator UI** | Use relevant frontend skills; list/create/edit/status/schedule/delete; conflict/reload UX; server-confirmed effective local interval. |
| **7A5 — reconciliation and writer enablement** | Production reconciliation, mutation-route enablement only after successful reconciliation, production validation, and retained evidence. |

Do not combine 7A1a and 7A1b into one large implementation PR unless repository coupling demonstrates that separation is impossible.

## Open product decisions

Keep these explicit gates; recommendations are not confirmed product decisions:

- active-edit confirmation UX;
- delete confirmation UX;
- audit retention duration;
- who may inspect audit history; and
- production smoke window.

The UI recommendation to default a new draft to inactive is not an approved hidden backend default.

## Rewards excluded

Rewards are outside Phase 7A and remain economically unapproved:

```text
reward stamp threshold: NOT APPROVED
monetary reward amount: NOT APPROVED
complementary-service economics: NOT APPROVED
redemption economics: NOT APPROVED
referral reward: NOT APPROVED
```

Historical `$80` and `$120` examples are non-requirements. No `RewardDefinition` implementation belongs in Phase 7A.
