# Bella Mujer Club product blueprint

## Vision

Bella Mujer Club is Bella Mujer Studio's loyalty experience. It should:

- strengthen repeat-client behavior and give clients a clear reason to return;
- let the studio recognize and reward loyalty;
- remain economically sustainable for Bella Mujer Studio;
- give Ale and Karen a simple operational workflow;
- maintain auditable history instead of relying on manual counters; and
- feel like a polished beauty loyalty experience, not a generic CRUD administration system.

**CONFIRMED** — The production Club belongs inside the existing Bella Mujer Studio platform. The independent prototype will not be maintained or transplanted. Its accepted product and visual ideas will be reconstructed using the production stack.

## Actors

### Studio administrator

Initially Ale and Karen. The intended administrator experience includes:

- registering and managing Club clients;
- registering visits and associating services and payment amounts;
- inspecting loyalty position and history;
- identifying a client through QR;
- managing promotions and, after economics are approved, rewards and redemptions;
- inspecting referral activity when that phase exists; and
- inspecting profitability implications through later analytics.

Core client, visit, loyalty, and history operations are planned before the later rewards, referrals, and analytics capabilities. See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

### Club member/client

The intended private member experience includes:

- viewing current stamp progress and transaction/stamp history;
- accessing her identification QR;
- seeing active promotions and recommendations; and
- later seeing referrals, rewards, appointments, and notifications as their phases are implemented.

## Confirmed loyalty behavior

### Accumulated eligible spend

**CONFIRMED** — Every `$300 MXN` of accumulated eligible consumption earns one stamp, with a maximum of one awarded stamp per visit.

**CONFIRMED** — Eligible spend above or below the threshold carries forward. Club therefore tracks an accumulated eligible-spend balance; it is not equivalent to `visit >= 300 ? stamp : no stamp`.

```text
Visit amount: $430
Previous carry: $0

$300 -> 1 stamp
Remaining eligible balance -> $130
```

On a later eligible visit:

```text
Existing carry: $130
New eligible visit amount: $200
Accumulated eligible amount: $330

Result: 1 stamp
Remaining carry: $30
```

Even when accumulated spend could cross the threshold more than once, the current visit still awards at most one stamp. The unconsumed eligible balance is retained for future visits. More examples appear in [DOMAIN.md](./DOMAIN.md#stamp-calculation).

### Auditable movements

**CONFIRMED** — Loyalty must not be modeled only as a mutable counter such as `client.stamps = 5`. Every relevant movement needs traceable history. Current balances may be derived or cached, but the underlying events and reasons remain auditable.

## Profitability and rewards

**CONFIRMED** — `$120 MXN/hour` is the target average Club profitability reference used to evaluate rewards and incentives. It is not a guaranteed minimum profit for every appointment.

**CONFIRMED direction** — Rewards should use a balanced model that can offer client-perceived value while avoiding economically harmful incentives. A member may eventually choose among benefit types such as:

- a monetary/value benefit; or
- a complementary service or add-on.

Rewards should be checked against profitability before activation.

**CONFIGURABLE / not finalized** — Exact stamp thresholds, values, eligible reward choices, validity, and redemption economics require approval and must not be hardcoded as product truth.

The historical examples below were explored during profitability analysis and are **not confirmed**:

```text
4 stamps -> $80 reward
3 effective referrals -> $120 reward
```

## Promotions

**CONFIRMED capability** — Club includes promotions. Administrators should eventually be able to:

- create and edit monthly promotions;
- activate and deactivate them;
- set validity periods; and
- control member-facing text.

**CONFIGURABLE** — Promotion content, dates, eligibility, and offers are managed content, not hardcoded Club rules.

**FUTURE** — Promotions may trigger notifications only after notification infrastructure exists.

## Referrals and later capabilities

**FUTURE** — Referrals are desired but are not part of the initial implementation. The eventual model should identify who referred whom, define when a referral becomes effective, keep reward economics configurable, and audit referral rewards like other loyalty rewards. The qualification threshold and reward are not finalized.

**FUTURE** — Club appointments, client notifications, and richer profitability/behavior analytics follow the stable core workflow.

## Client access experience

**CONFIRMED** — The member access product experience is:

1. Bella Mujer Studio registers the Club client.
2. The studio generates a private access link.
3. The link is sent to the client through WhatsApp.
4. On first access, the client establishes a 6-digit PIN.
5. Later access uses the private Club identity/access mechanism and PIN.
6. The studio can regenerate or reset access when necessary.

**CONFIRMED** — A Club member does not share the existing administrative Cognito identity/account. Cognito remains the administrative authentication boundary.

**OPEN TECHNICAL DECISION** — Invitation tokens, PIN credential derivation, session management, expiration, recovery, and the secure backend design require a dedicated security decision. Product documentation does not select or invent that architecture.

**DISCARDED** — SMS/Twilio verification will not be migrated.

## QR meaning

**CONFIRMED** — Client identification and client authentication are separate concerns. The QR:

- identifies a Club member for studio workflows;
- uses an opaque identifier;
- does not expose a name, phone number, or other sensitive client data directly; and
- is not an authenticated login credential.

Scanning does not award a stamp:

```text
scan QR
-> identify client
-> administrator registers/confirms visit
-> server applies loyalty rules
-> ledger event generated if applicable
```

The API and business logic are authoritative for eligibility and stamp computation.

## Service catalog context

**CONFIRMED architecture direction** — Club references the canonical Bella Mujer service catalog instead of maintaining duplicated service definitions. Inactive services must remain identifiable.

Approximately 135 service records were involved in prototype and audit work. That count is historical context, not a permanent invariant. No catalog data is imported by this blueprint.

Alisados/progressive-straightening services were intentionally treated as inactive in the prototype because of the previously identified safety issue. This note preserves that context; it does not create or alter catalog state here.

## Capability status matrix

| Capability or decision | Status |
|---|---|
| `$300 MXN` accumulated eligible spend per stamp | **CONFIRMED** |
| Maximum one stamp per visit | **CONFIRMED** |
| Carry excess eligible spend | **CONFIRMED** |
| Auditable loyalty ledger/history | **CONFIRMED** |
| Admin-managed client registration | **CONFIRMED** |
| Private access link sent through WhatsApp | **CONFIRMED** |
| 6-digit client PIN experience | **CONFIRMED** |
| Secure token/session/PIN backend design | **OPEN TECHNICAL DECISION** |
| QR separate from login | **CONFIRMED** |
| Monthly promotions | **CONFIRMED capability**; contents **CONFIGURABLE** |
| Balanced reward model | **CONFIRMED direction** |
| Exact stamp reward threshold and value | **CONFIGURABLE / not finalized** |
| Historical `$80` reward example | **Not confirmed** |
| Historical `$120` referral example | **Not confirmed** |
| Referrals | **FUTURE** |
| Appointments inside Club | **FUTURE** |
| Client notifications | **FUTURE** |
| SMS/Twilio verification | **DISCARDED** |
| SaaS/multi-studio product | **FUTURE / not being implemented now** |
| `studioId` structural awareness | **CONFIRMED architecture direction** |
