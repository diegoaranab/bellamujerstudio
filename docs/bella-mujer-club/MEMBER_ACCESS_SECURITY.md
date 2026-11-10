# Bella Mujer Club member-access security architecture

## Decision status and scope

**SELECTED IN PHASE 5A** — This document is the required architecture for later Bella Mujer Club member-access implementation. Phase 5A makes no application, API, infrastructure, persistence, Cognito, or deployment changes. Phase 5B–5D implementation PRs must follow this decision and receive their own security and production review.

The confirmed product experience remains:

1. A studio administrator creates the Club client.
2. The administrator generates a private access link and sends it manually through WhatsApp.
3. On first access, the member establishes a 6-digit PIN.
4. Later access uses an opaque Club member access handle plus the PIN.
5. The studio can regenerate an invitation or fully reset access.

SMS/Twilio verification is **DISCARDED**. WhatsApp is transport only: it is not integrated in Phase 5, and WhatsApp identity is not authentication. QR identification remains separate from authentication. Administrative Cognito remains exclusively administrative; Club members must not be added to or authenticated through its user pool.

## Security boundary and persistence

Member-access lifecycle data will use a dedicated DynamoDB table, conceptually `ClubAccessTable`, physically separate from the existing operational `ClubTable`.

`ClubAccessTable` contains only access concerns such as:

- member access mapping and credential state;
- PIN verifier metadata;
- invitations;
- sessions; and
- rate-limit/account-backoff state.

The existing `ClubTable` remains authoritative for `ClubClient`, `Balance`, `Visit`, and `LoyaltyLedger`. This separation keeps credential and session material out of ordinary Club data, permits narrower IAM for member-authentication Lambdas, avoids granting existing administrator/loyalty Lambdas access to PIN and session records, and limits what an accidental broad read or compromise of ordinary Club persistence exposes.

Phase 5A creates no table. The future access table initially has no GSI or LSI: every confirmed access pattern is a direct, bounded primary-key read. Conceptual records may use:

```text
pk = CLIENT#<clientId>
sk = MEMBER_ACCESS

pk = HANDLE#<sha256(accessHandle)>
sk = HANDLE

pk = INVITE#<sha256(invitationToken)>
sk = INVITE

pk = SESSION#<sha256(sessionToken)>
sk = SESSION
```

Exact attribute names can be finalized in Phase 5B without changing these access patterns. One expiry epoch attribute will support DynamoDB TTL for ephemeral invitation and session records. Permanent access and credential records omit it. TTL is asynchronous cleanup, never an authorization decision.

## Opaque member access handle

Each member receives a stable opaque access handle separate from `clientId`. It is generated with a cryptographically secure RNG, contains at least 128 bits of entropy (256 bits is preferred for consistency with other opaque secrets), uses a base64url-safe representation, and contains no name, phone, email, studio name, or other PII.

The handle identifies the credential to verify; it is not an authenticator by itself. Authentication still requires the PIN. A SHA-256 digest of the handle may be the physical lookup key so the raw handle need not be stored as a key.

Phone number, client name, raw DynamoDB physical keys, QR payload, and administrative Cognito identity must not be used as the member login identifier.

## Invitation and activation

An invitation token is a one-time enrollment secret with these properties:

- 256 cryptographically random bits, base64url encoded;
- one-time enrollment purpose;
- server-controlled expiry, with a default validity of 7 calendar days; and
- explicit invalidation and regeneration support.

Only `SHA-256(rawInvitationToken)` is stored. The raw token is returned only when the administrator generates the link, is never persisted in DynamoDB, written to logs, or returned later through a read API, and reaches the member only in the private access URL.

Generating a replacement invitation increments or replaces the current invitation generation/version. Every earlier unused invitation then fails logical validation immediately. Expired, consumed, or superseded rows may remain until TTL removes them, but their presence never makes them valid. Phase 5B must enforce invitation consumption, regeneration/supersession, and generation/version checks with conditional and/or transactional DynamoDB writes so an old, consumed, expired, or superseded invitation cannot become valid again because of a stale concurrent write. The one-time-token design is unchanged.

### Private WhatsApp URL and fragment handling

The current Angular application uses hash routing, so activation uses a shape such as:

```text
https://<frontend>/#/club/activar?access=<opaque-handle>&invite=<one-time-token>
```

Both values occur after the fragment marker. The raw invitation token must never appear in a GitHub Pages/server-side path, a normal URL path before `#`, analytics, logs, or a QR payload.

On load, Angular captures the invitation token in memory and immediately replaces/scrubs the browser URL to remove it from visible browser history before the member enters a PIN. The opaque, non-secret access handle may remain in the member route. The invitation token is never persisted in `localStorage` or `sessionStorage`. If a reload loses the in-memory token before enrollment completes, the member reopens the original WhatsApp link.

### Enrollment flow

```text
Admin creates Club client
    ↓
Admin generates private access invitation
    ↓
Server creates or reuses opaque access handle
    ↓
Server creates one-time invitation token
    ↓
Raw invitation URL is returned once
    ↓
Admin sends URL manually through WhatsApp
    ↓
Member opens activation route
    ↓
SPA captures and scrubs invitation token
    ↓
Member chooses and confirms 6-digit PIN
    ↓
POST enrollment: accessHandle + invitationToken + pin
    ↓
Server validates digest, generation, expiry, unused state,
handle/client relationship, PIN policy, and rate limits
    ↓
Server atomically creates/replaces the verifier, consumes the invitation,
establishes the credential version, and creates a short-lived session
```

Changes spanning access records must be transactional. Replaying a consumed invitation must not silently create another credential or session; it returns a safe generic invalid/used/expired-link response. Generation/version checks must be part of the same concurrency-safe state transition as invitation consumption and credential creation.

## Six-digit PIN credential

The product requires a member-selected, numeric, 6-digit PIN. This is a **product-constrained low-entropy memorized secret**, not a high-entropy password. It has a limited search space and is weaker than a modern general-purpose password. The design does not claim NIST password compliance or formal NIST AAL compliance.

Future server validation requires:

```text
^[0-9]{6}$
```

It also rejects clearly trivial/common PINs. At minimum this includes repeated digits from `000000` through `999999`, `123456`, and `654321`; implementation may use a small reviewed common-PIN denylist. There are no security questions. Birthday, phone suffix, client ID, and other PII must not derive a PIN.

Bella Mujer accepts the usability tradeoff only with compensating controls: an unguessable access identity, slow server-side verification, a unique salt and server-side pepper, strict account throttling plus route throttling, short revocable sessions, no persistent frontend session token, no self-service account discovery, and administrator-controlled reset.

### Verifier derivation

PINs are never stored in plaintext or reversibly encrypted. Phase 5B uses Node.js built-in cryptography:

1. Generate a unique random salt for each credential.
2. Pre-hash the PIN with HMAC-SHA-256 using a server-side pepper.
3. Pass the HMAC result through `scrypt`.
4. Store only the derived verifier, salt, KDF algorithm/version and parameters, credential version, and timestamps.

```text
prehash = HMAC-SHA256(serverPepper, pin)
verifier = scrypt(prehash, perCredentialSalt, ...)
```

The initial reviewed configuration target is OWASP-compatible `N = 2^15`, `r = 8`, `p = 3`, with an explicit safe Node.js `maxmem` appropriate for the Lambda memory allocation. Phase 5B must benchmark it under the actual Lambda allocation before production. Production cost must not be silently lowered to make tests fast; tests may inject a test KDF or explicit test-only parameters behind a deliberate seam.

### Pepper boundary

AWS Secrets Manager is the production storage boundary for the PIN pepper. The pepper must not be placed in source, GitHub, DynamoDB, frontend environment files, CloudFormation plaintext outputs, or logs. Credential metadata records a credential/pepper version so rotation can be deliberate.

Only enrollment and credential-verification functions that require the pepper receive permission to read it, and they may cache it for the lifecycle of a warm Lambda execution environment. Administrator Club UI Lambdas, loyalty Lambdas, member read Lambdas, and the frontend receive no pepper access. Phase 5A does not create the secret.

## Authentication throttling and errors

API Gateway throttling is best-effort and not identity-aware, so two layers are required:

1. **Route-level protection:** enrollment and login routes start with conservative API Gateway route rate/burst limits tighter than ordinary reads. Exact values can be tuned during deployment.
2. **Authoritative per-member backoff:** credential state records consecutive failures and `nextAllowedAt` (or equivalent), keyed to the account/access handle so distributed source IPs cannot bypass it.

The starting policy is:

```text
failures 1–2 -> normal rejection
failure 3    -> 30-second delay
failure 4    -> 2-minute delay
failure 5    -> 10-minute delay
failure 6+   -> 1-hour delay
```

Successful PIN authentication resets consecutive failures. The system does not automatically create a permanent lock, which would enable denial of service; administrator reset always provides recovery. IP/request throttling may be defense in depth but never replaces account throttling.

Phase 5B MUST implement failed-attempt and backoff transitions with DynamoDB concurrency-safe semantics: atomic `UpdateItem` operations where suitable, conditional expressions/compare-and-swap, or transactional writes when multiple records must change together. It must not use an unguarded read-modify-write sequence. Concurrent authentication attempts cannot lose failure increments, bypass `nextAllowedAt`, move throttle state backwards, or otherwise weaken the configured backoff. The server enforces `nextAllowedAt` authoritatively: a request arriving before the allowed time must not verify the PIN and must not reset or decrease throttle state. A successful PIN verification resets consecutive-failure/backoff state with equally concurrency-safe, conditional/version-aware semantics, so a stale successful authentication cannot erase a newer failure or backoff state; only the state corresponding to the authentication attempt being committed may be reset.

Login responses are generic and do not distinguish an unknown handle, incorrect PIN, or disabled credential. Invitation errors expose only a safe user concept, for example: `Este enlace ya no es válido. Solicita uno nuevo en Bella Mujer Studio.` A throttled request may return HTTP 429 with a safe retry delay. No response exposes DynamoDB, Lambda, KDF, Cognito, Secrets Manager, or other AWS internals.

## Login and current session architecture

Later login uses a contract conceptually equivalent to:

```text
POST /club/access/login
{
  accessHandle,
  pin
}
```

The server hashes the handle for lookup, loads credential state, applies throttling, verifies the PIN KDF, resets failures on success, and creates a new opaque session. It performs no phone lookup, SMS verification, or Cognito member authentication.

### Hosting-driven bearer decision

The current production topology is cross-site:

```text
SPA: https://diegoaranab.github.io/bellamujerstudio/
API: https://k6tjphkkg2.execute-api.us-east-1.amazonaws.com
```

Phase 5 therefore uses an opaque bearer session token rather than requiring a third-party/cross-site cookie:

- 256 cryptographically random bits, base64url encoded;
- raw token returned only after successful enrollment or login;
- only `SHA-256(rawSessionToken)` stored server-side;
- sent as `Authorization: Bearer <opaque-member-session>`;
- absolute lifetime of 8 hours, with no refresh token or required sliding refresh; and
- revoked server-side on logout.

The frontend keeps the raw token **in memory only**. It must not persist it in `localStorage`, `sessionStorage`, IndexedDB, a URL, or a cookie under the current topology. Refresh, a new tab, or browser restart therefore requires PIN authentication again. This is an intentional security/usability tradeoff for current static hosting. The access handle is not a credential and may remain in a route or other non-secret state.

This decision does not claim that browser-held bearer tokens are universally preferable to HttpOnly cookies. If frontend and API later move behind a controlled same-site custom-domain topology, the session may migrate to a host-only `Secure`, `HttpOnly`, `SameSite=Strict` or `Lax`, `Path=/` cookie with appropriate CSRF and CORS controls. That option does not block Phase 5. `SameSite=None` third-party cookies are not the current architecture foundation.

### Session persistence, authorization, and revocation

Conceptually:

```text
pk = SESSION#<sha256(rawSessionToken)>
sk = SESSION

studioId
clientId
credentialVersion
createdAtISO
expiresAtEpoch
```

Every protected request rejects a session immediately when its absolute expiry is reached, it is explicitly revoked, member access is disabled, or its recorded credential version differs from current member-access state. DynamoDB TTL only cleans up expired rows.

Each member has a monotonically increasing credential/access version. Sessions record the version under which they were issued, and authorization compares it with current access state. An administrator reset therefore invalidates all old sessions immediately without enumerating them.

Protected member routes use an API Gateway **Lambda request authorizer**, separate from the administrative Cognito authorizer. It:

1. requires the Bearer token;
2. hashes it;
3. directly reads the session from `ClubAccessTable`;
4. verifies expiry and revocation;
5. loads and validates current access state and credential version; and
6. emits only required trusted opaque context, such as `studioId` and `clientId`.

Authorizer caching must be disabled or configured so it cannot preserve authorization after reset or logout; revocation correctness has priority. Member feature Lambdas use trusted authorizer context. A member never supplies arbitrary `clientId` or `studioId` to select an account.

An explicit logout endpoint revokes the presented session server-side, and the frontend destroys its in-memory token. Browser close alone is not logout.

## Authorization and IAM boundaries

Authentication initially authorizes only member-facing reads of the authenticated member's own profile, Balance, loyalty history, and later active promotions. It never authorizes a member to register visits, award stamps, change eligible carry, write ledger entries, perform administrator adjustments, or select another client.

Least privilege is split by responsibility:

- **Admin access/invitation Lambda:** remains protected by admin Cognito; may verify/read the relevant Club client and mutate only required member-access invitation/reset state.
- **Enrollment/login Lambda:** may access member-access records, read the pepper, verify credentials, update throttling, and create sessions; it cannot mutate loyalty.
- **Member Lambda authorizer:** may read session and member-access state; it needs neither the pepper nor loyalty write access.
- **Member read APIs:** may read only the authenticated member's Club profile, balance, and history; they do not receive the pepper.
- **Existing Club administrator/loyalty Lambdas:** do not gain credential/session access merely because member access exists.

The operational `ClubTable` remains the loyalty authority, and Visit/Ledger mutations remain administrator operations.

## Regeneration, reset, and recovery

### Regenerate invitation

For incomplete enrollment or a lost/expired link, regeneration increments or replaces the invitation generation, immediately invalidates previous unused invitations, retains the member access handle unless a full reset is requested, and does not alter loyalty data.

### Full access reset

For compromised access or complete recovery, reset:

- increments the credential version;
- invalidates all sessions by version mismatch;
- invalidates outstanding invitations;
- removes or invalidates the current PIN verifier;
- rotates the opaque access handle so the old one no longer resolves for login; and
- creates a new enrollment state and invitation.

It leaves `ClubClient`, `Balance`, `Visit`, and `LoyaltyLedger` untouched. Member-access recovery never deletes loyalty history.

When full reset changes multiple access records, Phase 5B must perform the relevant state transition transactionally and/or with conditional/version-aware writes. Stale concurrent operations must not restore an old access handle, PIN verifier, invitation generation, credential version, or authorization associated with the pre-reset state. The credential/access version remains the authority for invalidating sessions; session enumeration or deletion is not required.

## Security logging

Logs must never contain a PIN, PIN verifier, raw invitation token, raw session token, phone number, or client name. Security logs may contain an operation name, API request ID, generic outcome/category, and AWS request metadata consistent with repository practice. Stable PII-equivalent identifiers should be omitted from routine logs when unnecessary. Member responses receive no sensitive internal errors.

## QR boundary

QR remains a separate identification mechanism. It contains only opaque client identification, never a member session, invitation token, or PIN. It does not authenticate the member, and scanning it never automatically creates a visit or stamp.

## Threat model

This architecture reduces the following risks; it does not claim the system is invulnerable.

| Threat | Selected mitigation |
|---|---|
| Automated/brute-force PIN guessing | Unguessable handle, slow salted and peppered scrypt verification, account backoff, API route throttling, common-PIN denial, generic responses. |
| Credential stuffing | A Club-specific PIN makes conventional reused-password stuffing less directly relevant; the same controls still limit automated guessing. |
| Leaked or reused invitation URL | 256-bit one-time token, digest-only storage, 7-day expiry, generation invalidation, immediate URL scrubbing, no browser storage, atomic consumption. |
| Invitation replay | Transactional one-time consumption; used, expired, and superseded generations fail logical validation. |
| Stolen session token | Digest-only server storage, 8-hour absolute expiry, in-memory-only frontend handling, logout revocation, access/version checks. |
| Session replay | Server-side session record, expiry/revocation checks on every request, credential-version invalidation; bearer theft remains a risk until expiry/revocation. |
| XSS/session-token theft | No durable browser storage, immediate invitation URL scrubbing, short session lifetime; normal Angular/CSP/output-encoding hardening remains required because active XSS can steal an in-memory bearer. |
| Database-only compromise | Raw invitations, sessions, PINs, and pepper are absent; unique salts and scrypt slow offline guessing, while Secrets Manager isolates the pepper. |
| Client/account enumeration | Opaque high-entropy handles, no phone lookup/self-service discovery, generic login and invitation errors. |
| Cross-client authorization | Authorizer derives `studioId`/`clientId` from validated session context; member requests cannot select them. |
| Compromised member access | Full reset rotates the handle and verifier state and increments credential version, immediately invalidating sessions and invitations without touching loyalty. |
| Concurrent authentication/state races | Atomic/conditional DynamoDB updates and version/generation checks prevent lost throttle increments, stale successful-authentication resets, and stale access-state resurrection. |
| Malicious member loyalty mutation | Member IAM and routes are read-only; authoritative Visit, Balance, and Ledger mutation remains behind admin authentication. |
| Secrets or PII in logs | Explicit prohibited-field policy and generic outcomes/errors; raw secrets are never logged. |
| Admin/member boundary confusion | Separate Cognito admin and opaque member authorizers, separate persistence/IAM, no Club members in admin Cognito. |

## Phase 5 implementation sequence

Member access must not be implemented in one PR:

```text
5A architecture/security decision (this document)
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

Phase 5B adds the access table, PIN KDF and pepper integration, invitations, sessions, throttling, member authorizer, and admin invitation/reset APIs—without member UI. Phase 5C adds administrator access management. Phase 5D adds the member route, invitation capture/scrubbing, enrollment, PIN login, in-memory session, and logout. Each slice requires its own implementation plan, model/reasoning recommendation, review, and proportionate validation.
