# Phase 6E active promotions architecture

**Status: 6E0 architecture complete; 6E1 backend merged, deployed and production-validated; 6E2 member UI merged, deployed and production-validated; Phase 6E closed / production-validated.** This is the technical and member-experience authority for the delivered member promotion capability. It interprets the confirmed promotion capability in [PRODUCT.md](./PRODUCT.md), the member security boundary in [MEMBER_ACCESS_SECURITY.md](./MEMBER_ACCESS_SECURITY.md), and the hierarchy in [BELLA_MUJER_UI_UX_DIRECTION.md](../BELLA_MUJER_UI_UX_DIRECTION.md). Configurable administration remains Phase 7.

## Evidence and decision

At starting commit `3678068a3de051b09b429bdf0cf4f585354ece4c`, promotion references are conceptual documentation; there is no production promotion model, persistence, API, infrastructure route, or member UI. Unrelated auth test strings containing `promotion` are not a promotion feature. `ClubTable` has base `pk`/`sk`, no indexes, and existing member routes use a separate session authorizer. Summary and history use trusted authorizer context; history performs bounded, paginated base-table queries. QR and history are components within `member-club-access`, not separate page directories. The member parent owns session and request state. Existing backend and e2e fixtures provide patterns for future tests. The requested `Software_Workflow.md` was not present in the repository at that commit.

Select **A: canonical promotion records in a dedicated studio promotion partition of ClubTable**, queried directly and strongly consistently. No promotion records go into `ClubAccessTable`. This is a deliberately small studio-wide catalog, not an unbounded history of every promotion ever created.

| Option | Assessment |
| --- | --- |
| A. Base table partition | One truth and direct strongly consistent Query; bounded by the explicit catalog cap below. Stable identity supports Phase 7 editing. No Scan or new infrastructure. Selected. |
| B. Base records plus active projection | Could reduce reads at scale, but activation, edits, schedules, and expiry require coordinated writes and time-driven maintenance. A transaction can atomically maintain writes but cannot make a clock transition update itself; stale projections and repair add complexity and duplicate state. Not justified for this catalog. |
| C. Dedicated table | Independent IAM, capacity, and lifecycle are useful at larger scale, but add a retained resource and operational boundary without a current need. Not selected. |
| D. GSI in ClubTable | A reviewed future access pattern may justify a GSI; Phase 2 does not forbid one. A status/time GSI here introduces eventual consistency and mutable index keys, still needs filtering or maintenance for expiry and ties, and does not solve boundedness without a quota. Not justified now. |

### Physical keys and bounded reads

```text
pk = STUDIO#<studioId>#PROMOTIONS
sk = PROMOTION#<promotionId>
```

The studio segment follows existing Club key validation; `promotionId` is a server-generated lowercase UUID v4. Neither keys nor IDs contain promotion text, mutable state, or client information. Each row is the single authoritative promotion, including inactive and scheduled rows. This partition is separate from the client directory and client aggregates.

At most **100 promotion rows per studio**, counting inactive, future and expired rows, may exist at once. This is a technical capacity constraint, not a claim about offer economics or simultaneous eligibility. Reads must remain bounded even if the invariant is violated: strongly consistent base-table `Query`, equality on `pk`, `begins_with(sk, 'PROMOTION#')`, no FilterExpression and no Scan. Iterate `LastEvaluatedKey` because DynamoDB may stop at 1 MB before the item limit; request no more than the remaining number needed to detect row 101, inspect at most 101 rows and issue at most 101 queries. A non-advancing cursor, 101st row, or incomplete traversal at the budget fails closed with a safe 500; never silently select from a partial catalog. Validate every returned row before selection, including inactive rows, and reject unexpected keys/attributes or invalid values. Do not rely on Query order for selection. The selected record is found in memory after the complete bounded traversal. IAM can restrict Query by `dynamodb:LeadingKeys` to the configured studio partition where supported; the handler still derives and validates trusted context and must fail closed on a studio mismatch with any fixed IAM scope.

Phase 6E has no promotion writer. Controlled validation may insert at most its one temporary fixture as described below, after checking the partition and cap. Phase 7 must enforce the 100-row cap under concurrent creates/deletes with a transactional, conditionally updated per-studio count and canonical row write/delete, with an explicit migration/reconciliation procedure before enabling writers. A counter is capacity metadata, not a duplicate promotion or active view; edits do not change it. Existing rows must be reconciled atomically or under a write freeze before Phase 7. Hard deletion/archival and audit policy are Phase 7 decisions; reaching the cap blocks creates until a reviewed lifecycle frees capacity. If the cap becomes unsuitable, revisit the access pattern before increasing it; never truncate results. This constraint is a prerequisite of the selected design, not a Phase 6 management feature.

## Canonical model and time

Persist exactly these attributes alongside `pk` and `sk`:

| Field | Constraint and purpose |
| --- | --- |
| `promotionId` | lowercase canonical UUID v4 (36 ASCII characters), generated securely; matches key. Opaque identity. |
| `studioId` | existing validated key segment: 1–128 Unicode code points, trimmed, no `#` or control characters; matches partition and trusted studio. |
| `title` | trimmed plain text, 1–100 Unicode code points, no control characters. |
| `description` | trimmed plain text, 1–500 Unicode code points; permit line feed only among control characters. No HTML, markup rendering, URLs as executable content, PII, or client-specific copy. |
| `status` | exactly `active` or `inactive` (6 or 8 ASCII characters); explicit switch independent of scheduling. |
| `startsAtISO`, `endsAtISO` | required canonical UTC ISO instants `YYYY-MM-DDTHH:mm:ss.sssZ`, 24 ASCII characters, valid round-trip; start strictly before end. |
| `createdAtISO`, `updatedAtISO` | same canonical UTC format; lifecycle metadata for future CRUD, `createdAtISO <= updatedAtISO`. |

Limits count Unicode code points after trimming; reject rather than silently truncate. These fields support member copy, explicit enablement, scheduling, identity and later editing. There is no priority, audience list, reward, CTA, admin identity, or targeting field. Do not store personal information in copy or logs. Phase 7 can evolve the model through a reviewed migration; it must preserve identity when editing text, state, or schedule.

Evaluate one server UTC instant per request, independently of the Lambda process timezone. A row is active iff `status === 'active' && startsAtISO <= now && now < endsAtISO`. Start is inclusive, end exclusive: exactly at start it is eligible; exactly at end it is not. Both bounds are mandatory; no open-ended offers. Invalid or noncanonical dates, reversed/equal ranges or malformed records fail the read safely rather than being interpreted as no promotion. Future authoring in `America/Mexico_City` must explicitly resolve the studio-local date and time with that IANA zone, reject nonexistent or ambiguous local times unless the author explicitly resolves the offset, convert to UTC before persistence, and show the effective local interval for confirmation. Never infer an offset from Lambda or browser local timezone.

Multiple promotions may be active. The server selects the one with the latest `startsAtISO`; for equal starts, the lexicographically smallest lowercase `promotionId` wins. Selection is in the handler/domain layer over the complete validated catalog, not based on DynamoDB order or the frontend. This deterministic rule is a display tie-break, not business priority. Eligibility in Phase 6 is studio-wide for **all authenticated Club members** of that studio. Configurable finer eligibility is deferred and cannot be represented as client IDs, names, phones or targeting rules in this slice.

## Member contract and security

`GET /club/me/promotions` follows the existing member route family. It accepts no query, path, body or header selectors for studio, client or promotion; reject unexpected query parameters with 400 rather than giving them meaning. The existing member authorizer derives both `studioId` and `clientId` from the validated session. Require valid context; no fallback studio. Authorizer rejection remains the existing 401/403 behavior. Missing/malformed trusted context, failed query, invalid data, or exceeded traversal budget returns the existing safe 500 style (`{ "error": "SERVER_ERROR", "message": "No pudimos cargar las promociones de Bella Mujer Club. Intenta de nuevo en unos minutos." }`); do not leak rows, tokens, keys, names or raw errors in logs. A normal empty result is 200, never used to conceal corruption. Do not cache personalized authenticated responses in shared caches; return `Cache-Control: no-store`.

Exact successful body:

```json
{ "promotion": { "title": "<plain text>", "description": "<plain text>", "startsAtISO": "2026-01-01T00:00:00.000Z", "endsAtISO": "2026-02-01T00:00:00.000Z" } }
```

Or `{ "promotion": null }` when none qualifies. Dates above illustrate syntax only, not offer content. The singular envelope reflects the approved one-promotion surface and keeps selection on the server; any future list is an explicitly versioned/compatible contract change, not a reason to leak a list now. Do not expose `studioId`, IDs, status, keys, creator or audit timestamps. Dates are member-relevant validity information. Validate the response client-side before rendering.

Attach the existing member Lambda authorizer to the route. Give its dedicated handler only the `dynamodb:Query` permission required on `ClubTable` and, where practical, the studio leading-key condition; no writes, Scan, access-table permission, or loyalty mutation permission. The existing authorizer alone reads `ClubAccessTable` for authentication. Membership remains required even for studio-wide content because this is a Club member experience, not an authorization to publish offers publicly. No arbitrary studio/client selector, member write, client identity duplication or PII logging is allowed. Test IAM and trusted context independently; frontend hiding is not authorization.

## Transitional production validation

No permanent authoring surface exists before Phase 7. After 6E1 is separately approved and deployed, an authorized operator may use a controlled one-off AWS CLI fixture in the correct account, region, table and studio to validate the actual protected endpoint. Use clearly identified, non-PII test copy approved for production visibility, a fresh opaque UUID, canonical valid dates and inactive/active state as needed; first verify key absence and capacity. Use a conditional put that cannot overwrite an existing row. Record only non-sensitive evidence and the fixture key; exercise empty, active and removal behavior through an authenticated test member. Remove exactly that fixture in a `finally`/cleanup step using a condition identifying the fixture; verify removal and no remaining fixture. Stop and investigate any failed condition or cleanup, without deleting other records. The fixture may be visible to all authenticated members while active; keep its window and duration controlled. The validation operator's narrowly scoped temporary write authorization is separate from the read-only member Lambda. This is an operational smoke test, not permanent promotion management or a grant to seed now. Actual promotion content and continued production authoring await Phase 7. No Angular/Lambda/CDK hardcoded offers, environment-variable content, or hidden permanent admin API.

## Member experience and ownership

Use the current Bella Mujer semantic typography roles: `--bm-font-expressive` (Newsreader) for expressive headings and `--bm-font-interface` (Source Sans 3) for interface and body copy. Use existing semantic wine/blush tokens and restrained spacing, with contrast verified against the actual rendered surface. The stamp progress remains the visual anchor. After QR and recent history, place one quiet, left-aligned promotion section before logout. Use an `h2` “Promoción” beneath the page `h1`, then a subordinate `h3` for its title, description in plain text and an explicit validity interval formatted in Spanish for `America/Mexico_City`, including date and time and clear exclusive-end wording; never imply the offer lasts through the whole end date. No CTA exists without a real action or destination. No carousel, autoplay, decorative animation, gradient default, all-caps eyebrow, or generic SaaS card kit.

If no promotion exists, omit the section entirely: the approved hierarchy calls for one only when one exists, so there is no fictional content or prominent empty state. During an independent read use a compact local loading label/placeholder after history, without blocking summary, progress, QR or history; remove it when empty. For a non-auth failure show a concise local error and a labeled retry button in that position; retry only this request, disable it while pending and avoid repeated announcements. A polite, atomic status region announces meaningful loading completion/error on retry without moving focus; avoid announcing a normal empty result or interrupting the greeting. On narrow screens stack and wrap content with no horizontal scrolling; on wider screens retain the same order and restrained width. Support zoom/reflow, keyboard access and visible focus, 44px minimum practical interactive targets, adequate contrast, no color-only meaning and full reduced-motion behavior. Verify WCAG 2.2 AA, including focus visibility and unobscured controls.

`MemberClubAccessComponent` owns the session token, request, state and retry, mirroring existing history/QR orchestration; `MemberClubApiClient` owns the typed, validated HTTP contract; a presentational `MemberClubPromotionComponent` receives state/data and emits retry, never owns or persists the token. Start the read independently of summary/history once a usable session is established; the existing summary gate may govern when home is displayed, but promotion completion must never gate any other request or surface. On retry cancel the prior subscription and increment a request generation; accept responses only when both generation and current session token match. Cancel and clear all promotion data/loading/error state immediately on logout initiation, session expiry/change and component destruction, including pending retries; late success or errors cannot render or clear a newer session. Current-session 401/403 follows the existing session-clear and re-login flow; stale auth failures must not clear a newer session. Other failures stay local, with retry and no stale offer shown. Never store bearer or promotion state in browser persistence.

## Required follow-up verification

- **Backend:** zero/one, future, expired, inactive, exact start/end, simultaneous active with equal-start tie, malformed records anywhere in catalog, failed/incomplete reads and safe errors; trusted authorizer context required and arbitrary selectors rejected.
- **Persistence:** exact partition/sort keys and validation, strong bounded Query and no Scan/filter; 1 MB pagination and deterministic full-catalog selection, 100/101 boundary, stalled cursors and budget exhaustion; no partial results. Test all string, identifier and date limits and cross-field/key consistency.
- **Infrastructure:** member authorizer attached to route; only required read-only Query on ClubTable, constrained leading key where used; no writes, Scan, access-table or loyalty mutation privileges on promotion Lambda.
- **Frontend:** null omits section, valid content and timezone/end wording, local loading/failure and retry, independent core UI, malformed response, auth expiry, logout/session changes, canceled and out-of-order requests, responsive reflow, keyboard, focus, announcements, contrast and reduced motion.
- **E2E:** authenticated home with active and no promotion; promotion failure leaves progress/QR/history usable; mobile/desktop visual and keyboard/accessibility smoke. Use controlled fixtures with no real PII or invented economics.

## Delivery gates

1. **6E0:** architecture/design gate, exact-HEAD review; documentation only.
2. **6E1:** domain, bounded persistence and member read API with backend/infrastructure tests and review; no UI or management CRUD.
3. Separately deploy backend and validate production with the controlled temporary fixture and cleanup; confirm protected empty/active behavior.
4. **6E2:** independently loading member UI, frontend and e2e tests and review against the approved direction.
5. Separately deploy Pages and validate production, then close Phase 6 with evidence. Phase 7 retains create/edit/activate/deactivate/schedule/manage and eligibility decisions.
