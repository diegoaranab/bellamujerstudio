# Bella Mujer Studio UI/UX direction — Phase 5F2

Decision date: 2026-11-13

Repository base: `38c8afb2598057a0a91413cb40407ab51d9b0bfe`

Application foundation: Angular 21 + Angular Material 21

## 1. Status and scope

This document is the durable design decision for Phase 5F2. It converts the Phase 5F1 audit into:

- one cross-product Bella Mujer design direction;
- explicit product and accessibility decisions;
- a disposition for every finding from `BM-UX-001` through `BM-UX-024`; and
- an ordered, atomic Phase 5F3 remediation plan.

It does not implement the direction. It changes no application behavior, routes, styles, components,
tests, backend, infrastructure, dependencies, or identity assets. Phase 5F3 remains the implementation
phase, and Phase 6 remains the member-product phase.

Decision labels in this document have the following meaning:

- **LOCKED** — a system or product rule that implementation must preserve;
- **TEST IN IMPLEMENTATION** — a bounded visual choice that needs representative-screen review;
- **REQUIRES APPROVAL** — an identity or business asset that cannot be inferred from the repository.

## 2. Evidence source

The evidence base is the completed [Phase 5F1 UI/UX audit](./BELLA_MUJER_UI_UX_AUDIT.md), which records
24 findings: 0 Critical, 6 High, 16 Medium, and 2 Low. Phase 5F2 does not repeat that audit.

The direction also respects the confirmed Club product and experience boundaries in:

- [PRODUCT.md](./bella-mujer-club/PRODUCT.md);
- [UX.md](./bella-mujer-club/UX.md); and
- [IMPLEMENTATION_PLAN.md](./bella-mujer-club/IMPLEMENTATION_PLAN.md).

Repository inspection confirms that Angular Material already supplies the control, form, menu, dialog,
and keyboard substrate; brand values are divided between generated Material values, global overrides,
and page-local declarations; and the existing `BM` treatment is text in a utility tile rather than an
approved identity asset.

The two design passes are intentionally complementary:

- `frontend-design` is authoritative for distinctiveness, composition, typography, restraint, and
  avoidance of template-derived beauty or SaaS presentation.
- `ui-ux-pro-max` is used for accessibility, interaction, responsive structure, forms, focus,
  navigation, and state behavior.

The generic design-system search proposed black/white motion storytelling and Playfair/Inter. That is
rejected because it conflicts with Bella Mujer's wine identity, calm local voice, operational needs,
and motion restraint. Generic pink/lavender beauty palettes and automatic use of Inter are also rejected.

## 3. Approved design premise

**LOCKED — Bella Mujer will use an “editorial studio / working atelier” direction.**

The premise is grounded in the studio's actual work rather than in category decoration:

1. Real Bella Mujer work is the strongest public proof and the principal source of visual character.
2. Wine and plum form the recognizable chromatic anchor; pink is not the answer to every hierarchy
   problem, and metallic accents are sparse details rather than a luxury costume.
3. Public pages feel editorial and calm, administrator pages feel like an efficient workbench, and
   member pages make progress and recognition feel rewarding.
4. One strong moment per screen carries personality. Repeated equal cards, decorative gradients,
   glass effects, and ornamental motion do not.
5. Angular Material remains the interaction and accessibility foundation. Bella Mujer semantic tokens
   and compositions control the visual personality above it.

The intended relationship is:

```text
Angular Material
        ↓
control behavior + interaction states + accessibility semantics
        ↓
Bella Mujer primitives and semantic roles
        ↓
public editorial / admin workbench / member progress compositions
```

This direction is more than a polish pass but is not a big-bang redesign. It rejects generic Material
dashboard styling without replacing Material's sound behavior.

## 4. Cross-product brand grammar

### Shared grammar

The following is shared by public, administrator, and member products:

- a controlled wine/plum brand family and neutral studio surfaces;
- the same semantic state, focus, spacing, radius, elevation, and motion authorities;
- the same type roles, even when expressive roles are used with different frequency;
- plain Mexican Spanish, sentence case, direct verbs, and no invented luxury language;
- one identity treatment hierarchy, with `BM` explicitly treated as a utility monogram;
- restrained dividers, grouping, and whitespace instead of card-everything composition;
- cause-and-effect motion only, with reduced-motion behavior built into acceptance;
- visible and consistent keyboard focus; and
- real content and product state rather than fictional controls or decorative data.

Shared grammar does not mean identical screens. A public story, a visit-registration work surface, and a
member progress home have different jobs and therefore different density and composition.

### Public mode — editorial, craft, real work

Public pages lead with one decisive editorial title and a real-work image or crop. Content remains
predominantly left-aligned; centered treatment is reserved for a genuine gallery or statement moment.
Photography carries the expressive load, so borders, backgrounds, and motion stay quiet.

Public compositions vary by purpose:

- home establishes trust and moves toward one WhatsApp conversation;
- services supports selection and expectation-setting;
- gallery supports visual browsing and reference sharing;
- contact prepares the client to send useful information; and
- gift cards guide a complete request and reliable recovery from errors.

### Administrator mode — compact operational workbench

Administrator pages prioritize current task, selection, status, and next action. The baseline is denser
than public or member mode, left-aligned, and calm. Lists and master-detail relationships may use rows,
dividers, grouped fields, and anchored action regions rather than wrapping every area in a pale card.

The current desktop sidebar and five-destination mobile navigation model are preserved. Generic hero
copy, decorative imagery, and celebratory motion do not enter normal operations. PII is progressively
revealed only when the operator opens the relevant client context.

### Member Club mode — progress, recognition, celebration

Member Club is warmer and more celebratory than admin but remains calmer than a gamified consumer app.
Its first bold element is current progress, followed by the next useful action. Achieved and pending
states use text and structure as well as color.

Celebration is earned by a completed event or milestone. It is not a permanent gradient, confetti layer,
or oversized access card. Member screens use friendly first-person labels such as `Mi Club`, `Mis sellos`,
and `Mi QR`, while avoiding administrative data and unapproved reward promises.

## 5. Mode differences at a glance

| Dimension | Public | Administrator | Member Club |
|---|---|---|---|
| Primary job | Build trust and start a WhatsApp conversation | Complete studio tasks quickly and safely | Understand progress and use Club benefits |
| Expressive material | Real-work photography and editorial type | Selection, status, data, and task hierarchy | Progress, recognition, and one earned celebratory moment |
| Density | Spacious | Compact | Comfortable |
| Display type | Prominent, normally once per page | Restrained; page title only when useful | Prominent for greeting/progress, not controls |
| Surface model | Open editorial sections; few framed regions | Rows, dividers, work surfaces, selective elevation | Progress surface plus a small number of supporting groups |
| Alignment | Mostly left; selective centered moments | Left and grid-aligned | Left with selective centered progress/QR moments |
| Motion | Minimal and content-neutral | State feedback only | Progress/state feedback; reduced-motion equivalent |
| Imagery | Real Bella Mujer work | Normally none | Restrained studio cue only where it improves trust |

## 6. Color and token authority

### Authority model

**LOCKED — one generated semantic authority replaces the current mixture of Material palettes, manual
`--mat-sys-*` overrides, and page-local brand colors.**

```text
brand primitives
        ↓
Bella Mujer semantic roles
        ↓
Angular Material system/component mapping
        ↓
rare component-specific roles
```

Brand primitives are a small palette of reviewed values, not values used directly in page components.
The current candidate family—wine ink, deep plum, porcelain blush, studio white, oxidized rose, and a
sparse warm material accent—remains the starting point. Exact values are **TEST IN IMPLEMENTATION** and
must pass their assigned contrast roles before approval.

Semantic roles are the source consumed by application composition and mapped into Material. Material
variables are generated or mapped from those roles; they are not a parallel place for creative overrides.
Component-specific roles are allowed only when a real component state cannot be expressed by an existing
semantic role. Page-local aliases of the full palette are prohibited.

### Required role categories

| Category | Minimum conceptual roles | Rule |
|---|---|---|
| Brand | primary, strong, soft, material accent, on-brand | Wine/plum anchors recognition; accent never becomes a second primary |
| Surfaces | canvas, surface, raised, sunken/subtle, inverse, scrim | Surface differences communicate hierarchy, not decoration |
| Text | primary, secondary, muted, inverse, link | Every foreground/background pair has an approved use |
| Actions | primary, secondary, quiet, destructive; hover/pressed/disabled | Controls keep Material behavior but use Bella Mujer roles |
| Borders | subtle, standard, strong, interactive | Border strength reflects grouping or state |
| Success | surface, foreground, border/icon | Never rely on green alone; pair with text/icon semantics |
| Warning | surface, foreground, border/icon | Reserved for recoverable caution, not general emphasis |
| Error | surface, foreground, border/icon | Used consistently by fields, summaries, alerts, and destructive actions |
| Information | surface, foreground, border/icon | Distinct from success and from brand promotion |
| Focus | ring and optional offset/backplate | Must remain visible on light, dark, and brand surfaces |
| Radius | control, grouped surface, overlay | A small scale; radius expresses object type, not route ownership |
| Elevation | flat, raised, overlay | Most grouping is flat; shadows are scarce and elevation has meaning |
| Spacing | base step plus compact/content/section tiers | Use a 4px base with an 8px rhythm; names describe purpose |
| Motion | instant/reduced, feedback, enter/exit, easing | Duration depends on cause and distance; motion never gates correctness |

This is a role inventory, not a mandate for hundreds of tokens. Phase 5F3 should begin with only the roles
needed by the first migrated surfaces and add a role only when at least two consumers or one essential
system state justify it.

### Locked usage rules

- No raw brand or state color in a page template or route stylesheet after that surface is migrated.
- Functional state is never communicated by color alone.
- Contrast is tested on the composed result, including hover, pressed, disabled, and focus states.
- Default composition is flat. Elevation identifies overlays or genuinely raised work surfaces.
- Radii are not a universal brand gesture; images, controls, grouped regions, and dialogs may differ by role.
- Gradients are not a default brand primitive. A future progress treatment may use one only after visual
  and contrast review establishes a functional reason.

## 7. Typography decision

### Decision

**LOCKED — use one expressive face and one calm interface face through explicit product roles.**

**TEST IN IMPLEMENTATION — prefer type-led evolution, but complete one bounded typography spike before
global font implementation.** This is not permission to browse many families during remediation.

The spike compares exactly two systems on the public home hero, an administrator selected-client work
surface, and the member `Mi Club` progress header:

1. **Refined continuity baseline:** Playfair Display + Poppins, using only real loaded weights and the
   role rules below.
2. **Single challenger:** Newsreader + Source Sans 3. Newsreader retains editorial warmth without copying
   a generic luxury template; Source Sans 3 is a calmer humanist interface face for Spanish, controls,
   and operational data.

The preferred path is the challenger if it wins the acceptance review. Refined continuity remains the
fallback if the challenger weakens Bella Mujer recognition, operational scanning, Spanish diacritics,
or loading/performance. Inter is not a candidate merely because it is conventional.

The spike is complete when the same real Spanish content is reviewed at representative mobile and desktop
sizes, at 200% zoom, with actual weights, and with a font-loading/fallback plan. It must select one pair;
it must not leave both systems active by product mode.

### Conceptual type roles

| Role | Intended use | Constraints |
|---|---|---|
| Expressive/display | One signature public or member moment | Not for forms, data, repeated cards, or long text |
| Page title | Unique `h1` and route orientation | May use expressive face publicly; restrained in admin |
| Section title | Major content/workflow grouping | Sentence case; hierarchy also supplied by spacing |
| Body | Explanations, service copy, guidance | Comfortable line height; roughly 60–75 characters on desktop |
| Interface/control | Navigation, buttons, fields, menus | Interface face; stable real weights; no decorative tracking |
| Data | Money, dates, balances, identifiers | Interface face with tabular figures where alignment matters |
| Label/caption | Supporting metadata and concise status | Never a default tiny uppercase eyebrow; remains readable at zoom |

Widespread all-caps eyebrows are retired. A compact label may use uppercase only when it identifies a
real category or workflow stage and remains readable. Font weights requested by CSS must exist in the
loaded font files; synthetic 700/800 weights are not accepted.

## 8. Identity and `BM` mark treatment

**LOCKED — `BM` is a utility monogram, not an approved Bella Mujer logo.**

Until an official identity asset is approved:

- pair the monogram with the visible name `Bella Mujer Studio` where identity or trust matters;
- use it as a compact avatar, app tile, or utility fallback, not as a decorative seal;
- do not enlarge it into a hero, stamp it repeatedly, or derive a loyalty mark from its current tile;
- keep accessible names on links/controls independent from the letters in the tile; and
- let real-work photography and plain brand copy carry public/member recognition.

Phase 6 is not blocked by a final logo. Stamp progress can launch with neutral, accessible achieved and
pending forms plus a textual count. Replacing those forms with an official mark is a separate approved
asset project. No final logo, stamp illustration, or pseudo-official mark may be generated inside Phase 5F3.

## 9. Accessibility baseline

**LOCKED — WCAG 2.2 Level AA is the explicit acceptance baseline for Phase 5F3 and new Phase 6 UI.**

Repository tests are necessary but not sufficient. Acceptance includes:

- complete keyboard operation in logical order, including menus, subviews, dialogs, and error recovery;
- a visible focus indicator on every operable control across light, dark, brand, and state surfaces;
- WCAG 2.2 focus-not-obscured minimum behavior for fixed headers, bottom navigation, and WhatsApp actions;
- text, meaningful icon, control-boundary, and focus contrast tested for the role each serves;
- headings, landmarks, current-page state, labels, names, descriptions, and status announcements that
  preserve meaning without visual styling;
- accessible authentication that allows paste, autocomplete/password-manager use, and does not require
  a cognitive test as the only path; NIP reveal is clearly named and stateful;
- a reduced-motion rendering in which information and state remain complete without animation; and
- route-change behavior that places focus predictably on the new view's main heading or main region and
  does not break browser back/forward behavior.

Skip links are present in both shells. A failed multi-field form keeps inline errors and moves focus to a
linked summary or the first invalid field according to the approved pattern. Notifications and toasts do
not steal focus. Color is never the only carrier of success, warning, error, selection, or progress.

The stronger WCAG 2.2 AAA focus-appearance and fully-unobscured criteria are desirable design guidance,
but are not mislabeled as AA requirements.

## 10. Responsive, navigation, and toolbar decisions

### Public mobile navigation

**LOCKED — replace the wrapping five-pill mobile header with a compact mobile menu.**

- All five meaningful destinations remain present in the menu; no route is removed for visual tidiness.
- A labeled WhatsApp action remains directly available in the compact sticky header in one activation.
- The menu trigger has a visible text label, exposes expanded state, closes predictably, and returns focus.
- The desktop route list remains visible at widths where it fits without wrapping.
- The compact header and any remaining fixed contact control reserve scroll/focus space so focused content
  is not obscured. Redundant floating contact actions should be removed rather than stacked.

Exact header spacing and breakpoint are **TEST IN IMPLEMENTATION** using content fit, 200% zoom, and long
Spanish labels rather than a device-name breakpoint.

### Administrator navigation and toolbar

The existing desktop sidebar and mobile five-item bottom navigation are **PRESERVE / NO_CHANGE** at the
information-architecture level. Phase 5F3 adds current-page semantics and focus protection but does not
replace this adaptive model.

**LOCKED — remove the enabled `Buscar` and `Notificaciones` toolbar controls.** Search has no defined
cross-product contract, and member/client notifications are future scope in Phase 8. Disabled or
“coming soon” toolbar controls would still spend attention on fictional features. They return only through
an approved product slice with real data, empty/loading/error states, permissions, and keyboard behavior.

The toolbar keeps only current context and actions that work on that screen.

## 11. Club mobile information architecture

### Decision

**LOCKED — use a route-backed selected-client workspace, not one long accordion and not state-only
in-page tabs.**

The conceptual hierarchy is:

```text
/admin/club
├── clientas                         directory and search
├── clientas/nueva                   explicit creation task
└── clientas/:opaqueClientId         stable selected-client context
    ├── resumen                      balance, status, minimum contact context
    ├── visita                       deliberate visit registration
    ├── historial                    auditable ledger/history
    └── acceso                       invitation/reset management
```

These paths express the decision; final route spelling is an implementation detail. The identifier must
remain opaque and contain no name, phone, or other PII.

On mobile, selecting a client navigates into a workspace with a compact persistent client context and an
explicit subview selector. Browser back returns to the directory with query and scroll state restored.
Every subview is deep-linkable, history is never hidden behind an ephemeral accordion, and a route refresh
can reconstruct the selected context safely.

On larger screens, the same URL state may render as master-detail: directory at the side, selected-client
workspace in the main region. Layout adaptation must not create a different navigation model or discard
the selected route. Visit registration is the clearest primary action after selection; destructive access
reset remains separated from routine navigation and requires its existing safeguards.

Implementation should split the current route component by workflow/state boundary while retaining a
single orchestration layer for shared selection and race-safety. It must not replace the large component
with a generic card abstraction or duplicate API state independently in each child view.

## 12. Member Phase 6 landing direction

**LOCKED — successful NIP login lands in `Mi Club`, not in an “active session” confirmation screen.**

The Phase 6 home hierarchy is:

1. personal greeting and current stamp/progress status;
2. a textual statement of progress and next eligible outcome, driven only by approved configuration;
3. one next useful action, normally `Ver mi QR` or the relevant progress/history action;
4. recent Club history;
5. one active promotion when one exists; and
6. recommendations as secondary content.

No screen hardcodes the illustrative four-stamp threshold or an unapproved reward. Empty states explain
what will appear and what the member can do next. QR is identification for the studio, not authentication
or automatic stamp issuance, and the rendered payload exposes no PII.

Before Phase 6 exists, Phase 5F3 makes the access state truthful: `Acceso verificado`, the session exists
only in the current tab and is lost on refresh/new tab, and logout is the only available session action.
The dead-end is accepted only as an accurate temporary state; Phase 6 replaces it with navigation to
`Mi Club` rather than layering a dashboard into the access component.

## 13. PII presentation principles

**LOCKED — shared studio surfaces show the minimum client information necessary for the immediate task.**

- `Inicio`, summaries, and recent-activity regions use a first name plus last initial or another minimal
  disambiguator; they do not show full phone numbers by default.
- Client lists show the name and operational status. A masked phone ending may be shown only when needed
  to distinguish similar records. Search may accept a full phone without echoing it broadly.
- Full name, phone, access state, and detailed history appear only after the operator deliberately opens
  the selected-client workspace.
- Persistent selected-client context uses the minimum stable identity needed to prevent acting on the
  wrong person; it does not repeat contact details in every subview.
- Copy/share actions reveal exactly what will be copied and never include access secrets after the
  existing one-time lifecycle allows them to disappear.
- QR payloads, route labels, screenshots used in documentation/tests, logs, alerts, and empty examples
  contain no client PII. Route identifiers remain opaque.
- Visual masking is not a backend authorization control. Phase 5F3 changes presentation only and keeps
  existing authentication and data-permission boundaries intact.

The selected-client workspace may show fuller detail because that is an intentional context. A future
privacy mode is not required to begin remediation, but no new broad PII surface may be introduced.

## 14. Finding disposition matrix

Final priority reflects the required remediation order after design decisions, not only the original
severity. Each finding appears exactly once.

| Finding | Disposition | Final priority | Rationale | Dependency | Proposed remediation slice | Acceptance |
|---|---|---|---|---|---|---|
| BM-UX-001 | `FIX_BEFORE_PHASE6` | High | A failed long form must expose and focus its errors reliably. | Shared feedback roles from 5F3-04 | 5F3-05 — gift-card recovery | Objective: focus, links, inline errors, keyboard/SR tests |
| BM-UX-002 | `FIX_BEFORE_PHASE6` | High | Enabled no-op controls undermine trust; neither feature has approved near-term scope. | None | 5F3-02 — truthful admin toolbar | Objective: no enabled fictional control remains |
| BM-UX-003 | `FIX_BEFORE_PHASE6` | High | Invalid private links need a safe path back to the studio. | Approved WhatsApp recovery copy; preserve secret handling | 5F3-06 — member trust/access | Mixed: secure URL/copy tests plus product-copy review |
| BM-UX-004 | `FIX_BEFORE_PHASE6` | High | Session scope is misstated and the Phase 6 destination must be explicit. | Phase 6 `Mi Club` direction in §12 | 5F3-06 — member trust/access | Mixed: objective tab/session wording plus copy review |
| BM-UX-005 | `DEFER` | Low | Production is configured; the local unavailable state is real debt but does not block Phase 6. | Revisit when local/demo setup is redesigned | Post-Phase 6 Club resilience backlog | Judgment: concise diagnostic without misleading disabled work |
| BM-UX-006 | `DEFER` | Low | The spacing defect is clear but isolated and low risk. | Future Club cleanup | Club maintenance backlog | Objective: name and phone are separately readable/labeled |
| BM-UX-007 | `FIX_BEFORE_PHASE6` | High | The measured 1.67:1 CTA contrast failure violates the AA baseline. | None | 5F3-01 — public contrast hotfix | Objective: tested role contrast in all states |
| BM-UX-008 | `FIX_BEFORE_PHASE6` | High | Skip and route focus behavior are cross-product navigation requirements. | Shell/router focus strategy | 5F3-03 — shell navigation accessibility | Objective: keyboard/SR route-change tests |
| BM-UX-009 | `FIX_BEFORE_PHASE6` | Medium | Desktop admin must expose the same current-location meaning as visual/mobile navigation. | None | 5F3-03 — shell navigation accessibility | Objective: exactly one correct `aria-current` |
| BM-UX-010 | `FIX_BEFORE_PHASE6` | High | Focus-not-obscured minimum is part of WCAG 2.2 AA. | Final public compact header/floating-action behavior | 5F3-03, verified again in 5F3-07 | Objective: zoom and keyboard focus remain visible |
| BM-UX-011 | `FIX_BEFORE_PHASE6` | High | NIP entry needs reveal and dependable failed-submit focus while preserving paste/autocomplete. | Member access control pattern | 5F3-06 — member trust/access | Objective: keyboard/SR/authentication tests |
| BM-UX-012 | `FIX_BEFORE_PHASE6` | High | Error styled as success breaks state meaning and shared feedback authority. | Semantic state roles from 5F3-04 | 5F3-05 — gift-card recovery | Objective: role, icon/text, live semantics, contrast |
| BM-UX-013 | `FIX_BEFORE_PHASE6` | High | Phase 6 must not build on a long, state-only mobile workflow. | 5F3-04 tokens; route/context architecture before composition | 5F3-08 and 5F3-09 — Club workspace | Mixed: deep links/back/state tests plus task-flow review |
| BM-UX-014 | `IMPROVE_BEFORE_PHASE6` | Medium | Wrapped mobile pills are usable but not resilient to zoom or label growth. | Shell focus behavior from 5F3-03 | 5F3-07 — public mobile navigation | Mixed: fit/keyboard tests plus visual review |
| BM-UX-015 | `DEFER` | Medium | The empty inventory column wastes space but does not affect core Club/Phase 6 readiness. | None | Post-Phase 6 inventory layout pass | Mixed: responsive geometry plus hierarchy review |
| BM-UX-016 | `DEFER` | Medium | Public curation needs content ownership and analytics, not a blind truncation. | Content/photography decision | Post-Phase 6 public content pass | Judgment: conversion and content review |
| BM-UX-017 | `FIX_BEFORE_PHASE6` | High | Phase 6 needs a visual parent shared across all three products. | Direction in §§3–5 | 5F3-04 — semantic design foundation | Judgment: representative public/admin/member review |
| BM-UX-018 | `DEFER` | Medium | Route-specific composition is valuable but does not block the new system foundation. | Public content strategy and 5F3-04 foundation | Post-Phase 6 public composition pass | Judgment: each route expresses its actual job |
| BM-UX-019 | `IMPROVE_BEFORE_PHASE6` | Medium | Trust needs honest identity treatment, but a final mark is not required. | Official mark remains separate approval | 5F3-06 and 5F3-07 — utility monogram treatment | Judgment: no pseudo-logo; clear studio identity |
| BM-UX-020 | `IMPROVE_BEFORE_PHASE6` | High | Club's hero/card density obstructs fast work and should improve with the new workspace. | 5F3-08 route/context foundation | 5F3-09 — Club workspace composition | Mixed: task reachability plus visual hierarchy review |
| BM-UX-021 | `FIX_BEFORE_PHASE6` | High | New member UI cannot add another token authority. | Approved role model in §6 | 5F3-04 — semantic design foundation | Objective role coverage plus visual/contrast review |
| BM-UX-022 | `FIX_BEFORE_PHASE6` | High | Real weights and stable roles must precede Phase 6 type expansion. | Bounded typography spike in §7 | 5F3-04 — semantic design foundation | Mixed: real-weight/loading checks plus type review |
| BM-UX-023 | `IMPROVE_BEFORE_PHASE6` | Medium | Extraction is warranted only along approved workflow boundaries, not as a generic component rewrite. | 5F3-04 roles and 5F3-08 route/context design | 5F3-08 and 5F3-09 — focused extraction | Objective state/regression tests plus maintainability review |
| BM-UX-024 | `DEFER` | Low | Telephone keyboard optimization is useful but does not block Phase 6. | Apply when either form is next changed | Form ergonomics maintenance backlog | Objective: semantic input and mobile keyboard behavior |

Disposition totals:

- `FIX_BEFORE_PHASE6`: 14
- `IMPROVE_BEFORE_PHASE6`: 4
- `DEFER`: 6
- `PRESERVE / NO_CHANGE`: 0 findings (preservation rules are recorded separately in this document)

## 15. Ordered Phase 5F3 remediation slices

Each slice is a separate implementation/review unit. A slice may cover only the named boundaries; it may
not opportunistically redesign adjacent pages. `Codex` below means the current supported Codex coding
model in the repository workflow, not a permanently pinned marketing model name.

### 5F3-01 — Public contrast hotfix

- **Objective:** replace the confirmed home contact-panel CTA failure with a tested on-dark secondary
  action treatment.
- **Findings:** BM-UX-007.
- **Expected code boundary:** public home template/style and focused accessibility test only.
- **Likely risk:** low; accidental weakening of hover/focus or visual action hierarchy.
- **Required validation:** computed contrast for default/hover/focus, keyboard focus, 200% zoom, public
  home regression at mobile and desktop.
- **Suggested Codex model/reasoning:** Codex, medium reasoning.
- **Dependencies:** none; ship first because it is a measured user-facing failure.

### 5F3-02 — Truthful administrator toolbar

- **Objective:** remove enabled `Buscar` and `Notificaciones` no-op controls and rebalance the toolbar
  around real context/actions.
- **Findings:** BM-UX-002.
- **Expected code boundary:** administrator layout template/style and shell tests.
- **Likely risk:** low; toolbar spacing and assumptions in responsive tests.
- **Required validation:** desktop/tablet/mobile shell render, keyboard order, no empty action container,
  existing navigation tests.
- **Suggested Codex model/reasoning:** Codex, medium reasoning.
- **Dependencies:** none.

### 5F3-03 — Shell navigation accessibility

- **Objective:** add skip links, predictable route-change focus, desktop admin current-page semantics,
  and focus exclusion for fixed UI.
- **Findings:** BM-UX-008, BM-UX-009, BM-UX-010.
- **Expected code boundary:** public/admin layouts, router focus helper or app-shell integration, global
  focus/scroll offset roles, and shell E2E tests.
- **Likely risk:** medium; stealing focus on initial load or back navigation, duplicate current state,
  fixed-control regressions.
- **Required validation:** keyboard-only navigation, screen-reader-oriented DOM assertions, browser
  back/forward behavior, 200% zoom, short-height viewport, mobile bottom bar and public WhatsApp control.
- **Suggested Codex model/reasoning:** Codex, high reasoning.
- **Dependencies:** 5F3-02 first to test the final toolbar control set.

### 5F3-04 — Bella Mujer semantic design foundation

- **Objective:** establish the minimal primitive → semantic → Material mapping, formalize the three modes,
  and select/load the approved typography system after the bounded spike.
- **Findings:** BM-UX-017, BM-UX-021, BM-UX-022.
- **Expected code boundary:** global theme/token/type files and a deliberately small set of shared semantic
  primitives; representative public/admin/member test states and screenshots. No bulk page migration.
- **Likely risk:** high; cascade and Material state regressions, contrast failures, font layout shift,
  uncontrolled token proliferation.
- **Required validation:** token authority inventory, Material control states, contrast matrix, real font
  weights/fallback/loading, reduced motion, representative screenshots at 390/820/1440, build and E2E.
- **Suggested Codex model/reasoning:** Codex, high reasoning, with `frontend-design` and
  `ui-ux-pro-max` used together.
- **Dependencies:** 5F3-01 remains an independent hotfix; 5F3-03 establishes focus requirements that the
  focus roles must preserve.

### 5F3-05 — Gift-card recovery and semantic feedback

- **Objective:** focus a linked error summary after failed submission, retain inline errors, and replace
  the success-styled error with shared semantic feedback.
- **Findings:** BM-UX-001, BM-UX-012.
- **Expected code boundary:** public gift-card component/template/style, the smallest shared feedback/error
  summary primitive justified by reuse, and component/E2E accessibility tests.
- **Likely risk:** medium; focus timing with Angular rendering, duplicated announcements, regression of
  WhatsApp handoff.
- **Required validation:** keyboard and screen-reader flow, linked-field focus, one announcement,
  success/error contrast, popup-blocked and API-error paths, existing gift-card tests.
- **Suggested Codex model/reasoning:** Codex, high reasoning.
- **Dependencies:** 5F3-04 semantic state roles.

### 5F3-06 — Member trust and accessible NIP entry

- **Objective:** add safe WhatsApp recovery for invalid links, correct current-tab session language,
  provide accessible NIP reveal and invalid-submit focus, and apply the honest utility-monogram treatment.
- **Findings:** BM-UX-003, BM-UX-004, BM-UX-011, member portion of BM-UX-019.
- **Expected code boundary:** member access component/template/style, contact URL builder if reusable,
  and member access tests. No Phase 6 home implementation.
- **Likely risk:** high; accidental credential leakage, weakened autocomplete/paste, session-security copy
  drifting from actual behavior.
- **Required validation:** invitation URL scrubbing, recovery message contains no credential, paste and
  autocomplete, reveal accessible name/state, invalid-form focus, refresh/new-tab copy accuracy, logout,
  reduced motion, 200% zoom.
- **Suggested Codex model/reasoning:** Codex, high reasoning.
- **Dependencies:** 5F3-04 tokens/type and 5F3-05 error-summary pattern where applicable.

### 5F3-07 — Public compact mobile navigation

- **Objective:** replace wrapping route pills with the compact menu, retain all destinations, keep a
  one-activation WhatsApp action, and apply honest utility identity treatment.
- **Findings:** BM-UX-014, public portion of BM-UX-019; revalidates BM-UX-010.
- **Expected code boundary:** public layout template/style/component and navigation E2E tests.
- **Likely risk:** medium; menu focus management, long-label/text-zoom fit, header/WhatsApp duplication.
- **Required validation:** 320/390/820 widths, 200% zoom, keyboard open/close/Escape/focus return,
  current route, all five destinations, one-action WhatsApp, focus not obscured.
- **Suggested Codex model/reasoning:** Codex, high reasoning plus visual review.
- **Dependencies:** 5F3-03 focus strategy and 5F3-04 semantic foundation.

### 5F3-08 — Club route and selected-client context foundation

- **Objective:** introduce the route-backed client workspace and stable orchestration/context boundary
  without changing Club business behavior.
- **Findings:** BM-UX-013 and structural portion of BM-UX-023.
- **Expected code boundary:** administrator Club child routes, a Club orchestration/context layer, thin
  directory/workspace route containers, and routing/state tests.
- **Likely risk:** high; stale async results, lost filters/scroll, duplicated API requests, direct-link
  loading, accidental PII in URLs.
- **Required validation:** deep link/refresh/back/forward, opaque IDs, restored directory state, client
  switch race tests, retry/idempotency behavior unchanged, mobile and desktop routing E2E.
- **Suggested Codex model/reasoning:** Codex, high reasoning.
- **Dependencies:** 5F3-04 semantic foundation; route architecture lands before visual recomposition.

### 5F3-09 — Club operational workspace composition

- **Objective:** render the route-backed workspace as mobile subviews and desktop master-detail, compact
  the hero, prioritize visit registration, and replace nested equal cards with meaningful grouping.
- **Findings:** BM-UX-013, BM-UX-020, workflow portion of BM-UX-023.
- **Expected code boundary:** focused Club directory, summary, visit, history, and access components plus
  route-level composition/styles/tests. API/domain services remain unchanged.
- **Likely risk:** high; operational regressions across loading/error/replay/access states and visual
  density failures at mobile/tablet sizes.
- **Required validation:** representative configured/unconfigured/loading/error/rich states; selection →
  visit and selection → history task checks; keyboard and screen-reader flow; 390/820/1440 screenshots;
  no horizontal overflow; existing race, ledger, access, and visit tests.
- **Suggested Codex model/reasoning:** Codex, high reasoning, with both design skills and
  explicit visual/product judgment.
- **Dependencies:** 5F3-08 routes/context, plus the shared roles from 5F3-04.

All 14 `FIX_BEFORE_PHASE6` findings are covered by 5F3-01 through 5F3-09. Phase 6 may begin only after
those fixes pass their slice gates and Phase 5F4 closes the important audit findings.

## 16. Explicit non-goals

Phase 5F2 and the approved 5F3 architecture do not:

- implement Phase 6 member home, stamps, history, QR, promotions, or recommendations;
- invent reward thresholds, values, referral rules, or promotion content;
- replace Angular Material or rebuild accessible controls from scratch;
- create a final logo, loyalty stamp, or other official identity asset;
- use a broad token search-and-replace or migrate every screen in one PR;
- turn the application into generic SaaS, Material dashboard, pink/lavender beauty, black/gold luxury,
  glassmorphism, gradient-heavy, or motion-led presentation;
- introduce a dark theme merely because token roles can support one later;
- change authentication, member session, authorization, QR, PII permission, or loyalty behavior;
- implement speculative administrator search or notifications;
- redesign deferred public content, inventory layout, or all page-local components; or
- deploy, merge, or begin implementation from this decision document.

## 17. Remaining human and asset approvals

The following decisions cannot be completed by code or Markdown alone:

1. **Typography visual gate:** approve Newsreader + Source Sans 3 or select the refined Playfair Display +
   Poppins fallback after the bounded three-screen spike. The role system is already locked.
2. **Exact palette values:** approve the contrast-tested values produced from the wine/plum candidate
   family. Role authority and usage rules are already locked.
3. **Official identity:** commission or approve a final Bella Mujer mark and optional Club stamp artwork
   as an independent asset project. This does not block 5F3 or Phase 6.
4. **Photography curation:** approve which real-work images represent each public route and any restrained
   trust cue used in member surfaces.
5. **Visual acceptance:** review representative public, admin, and member compositions during 5F3-04 and
   the Club task flow during 5F3-09. Markdown defines the rules but does not replace visual iteration.

Everything else required to begin the ordered Phase 5F3 slices is decided in this document.
