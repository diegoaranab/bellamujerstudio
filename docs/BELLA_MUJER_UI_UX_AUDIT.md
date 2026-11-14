# Bella Mujer Studio UI/UX audit — Phase 5F1

Audit date: 2026-11-13

Repository base: `7590cf5e2ddb0f944d99969352c565f36b719f5d`

Application stack: Angular `21.2.26`, Angular Material `21.2.14`

## Executive summary

Bella Mujer currently feels like three related but uneven products.

- The public website is the strongest expression of the brand. Its wine-and-blush palette, editorial serif scale, real studio work, local Tehuacán context, and direct WhatsApp language are recognizable and worth preserving.
- The general administrator experience is usable and responsive, but visually resembles a conventional Material/SaaS dashboard. Uniform pale cards, generic Material icons, weak task hierarchy, and toolbar actions that look functional but do nothing make it feel less considered than the public site.
- Club administration is substantially more branded than the rest of the administrator product. Its richer hierarchy is a useful prototype for the next system, but its large hero and repeated card treatment compete with fast operational work, especially on mobile.
- Member access is functionally clear and security-conscious, but visually generic and occasionally misleading. The invalid-link state has no direct recovery action, and the active-session copy promises continuation without a Phase 6 destination.

No evidence supports discarding Angular Material. It supplies sound control behavior, form semantics, and interaction states. The opportunity is to stop letting Material cards and icons define the product's character. Bella Mujer needs a deliberate layer above Material: fewer generic containers, a clearer task hierarchy, a real identity asset, shared semantic tokens, and distinct public, operational, and member compositions that still feel like one studio.

The audit found **24 actionable items: 0 Critical, 6 High, 16 Medium, and 2 Low**. The highest priorities before Phase 6 are gift-card error recovery, a confirmed contrast failure, nonfunctional administrator toolbar controls, the long linear Club workflow on mobile, cross-product brand discontinuity, and the fragmented token/style implementation.

## Scope and method

This was a read-only product and visual audit. It did not change application behavior, source, tokens, tests, dependencies, backend, infrastructure, or data.

The audit used:

- repository product truth in `PRODUCT.md`, `UX.md`, and `IMPLEMENTATION_PLAN.md`;
- all configured routes, both application shells, global styling, representative components, and current Material usage;
- Playwright screenshots at approximately `390 × 844`, `820 × 1180`, and `1440 × 1000`;
- local demo administrator data;
- browser-only Angular development-mode signal injection with fictional clients for a richer Club state;
- browser-only in-memory member-session injection for the success state;
- focused `frontend-design` and `ui-ux-pro-max` passes; and
- the repository's existing Playwright accessibility, navigation, and Club checks.

Forty screenshots were written to `/tmp/bella-mujer-ui-audit/`. They are evidence only and are not repository artifacts.

## Product and route inventory

### Public product

| Route | Surface | Primary job |
|---|---|---|
| `/` | Home | Establish trust, show real work, and start a WhatsApp conversation |
| `/servicios` | Services | Explain service categories and expectations before contact |
| `/galeria` | Gallery | Supply visual references and encourage sharing one through WhatsApp |
| `/contacto` | Contact | Explain what to send and set expectations for appointment coordination |
| `/tarjeta-regalo` | Gift card request | Collect request details, preview the card, and hand off to WhatsApp |

### Administrator product

| Route | Surface | Primary job |
|---|---|---|
| `/admin/login` | Administrator entry | Explain local/Cognito access state and enter the panel |
| `/admin/inicio` | Inicio | Summarize studio data and expose common actions |
| `/admin/club` | Bella Mujer Club | Find clients, inspect balance/access/history, create clients, and register visits |
| `/admin/servicios` | Services administration | Inspect the canonical service catalog |
| `/admin/clientes` | Clients | Inspect general client records |
| `/admin/inventario` | Inventory | Inspect stock, low-stock states, and recent adjustments |
| `/admin/tarjetas-regalo` | Gift cards | Search, filter, inspect, and update gift-card requests |
| `/admin/tarjetas-regalo/:id` | Gift-card detail | Inspect one request and its state |
| `/admin/asistente` | Assistant | Use the current assistant conversation UI |
| `/admin/configuracion` | Configuration | Operate local demonstration controls |

Legacy top-level administrator paths redirect into `/admin/**`; they are routing compatibility, not separate surfaces.

### Member Club access

| Route | Surface | Primary job |
|---|---|---|
| `/club/activar` | Enrollment | Consume a private invitation and create a six-digit NIP |
| `/club` | Login/session | Enter with a NIP, show invalid-link states, verify a session, and log out |

The Phase 6 member home, stamps, QR, promotions, and recommendations do not exist yet and were not treated as missing Phase 5 functionality.

## Current design inventory

### Typography

- Poppins is used for interface, body, and data; Playfair Display is used globally for `h1`–`h4`.
- The public site uses very large Playfair hero headings (`clamp()` up to roughly 5.75rem), while administrator screens use a smaller editorial-heading treatment over Material controls.
- Google Fonts loads Poppins weights 300–600 and Playfair Display 400/600/700. Component CSS nevertheless requests Poppins-like weights 700 and 800 in many labels and controls, so those weights are synthesized by the browser.
- Eyebrows are pervasive: small, uppercase, wine-colored, and often widely tracked. They aid hierarchy in moderation but become repetitive across public and Club screens.

### Palette and tokens

The global semantic foundation defines:

| Token | Current value | Current role |
|---|---:|---|
| `--bm-brand-wine` | `#8a1e3f` | Primary brand/action color |
| `--bm-brand-rose` | `#a98585` | Muted brand accent |
| `--bm-brand-sand` | `#c09579` | Warm accent |
| `--bm-brand-blush` | `#fffafa` | Light brand surface |
| `--bm-text-muted` | `#6b5b66` | Secondary text |
| `--bm-radius-card` | `24px` | Large branded cards |
| `--bm-radius-soft` | `16px` | Notices and secondary surfaces |
| `--bm-shadow-soft` | wine-tinted 16/40 shadow | Branded elevation |

Angular Material is initialized with the Azure and blue palettes, then selected Material system variables are manually overridden with Bella Mujer values. Public route styles also redeclare local `--wine`, `--dark`, `--blush`, `--soft`, `--sage`, and `--gold` variables. The visual result is coherent enough, but token authority is split between Material generation, global overrides, and page-local values.

### Material foundation

Current use includes buttons, icon buttons, cards, form fields, inputs, selects, menus, chips, lists, toolbar, dialogs, snack bars, checkboxes, dividers, and progress spinners. Material is strongest where it provides form and keyboard behavior. It is weakest when `mat-card`, `mat-icon`, pills, and default elevation become the visual idea rather than the interaction foundation.

### Shells and navigation

- Public: a brand block plus five pill-like route links and a WhatsApp action. On mobile the route links wrap into two rows and the header WhatsApp action is hidden; pages provide their own WhatsApp actions.
- Administrator desktop: a 240px sidebar with nine destinations plus a sticky toolbar.
- Administrator mobile/tablet through 900px: a fixed five-item bottom bar (`Inicio`, `Clientes`, `Cita`, `Club`, `Más`) and a menu for secondary destinations.
- Member access: a centered standalone card on tablet/desktop and an edge-to-edge white surface on mobile.

### Surface and card language

- Public marketing surfaces use 8px image/card radii, thin wine-tinted borders, restrained shadows, editorial headings, and large whitespace.
- General administrator surfaces use 20–24px Material cards with pale blush backgrounds and similarly weighted sections.
- Club administration uses 24px white cards, a large wine gradient hero, multiple badges, decorative circles, and editorial headings.
- Member access uses one 24px card, a wine BM monogram, outlined fields, and large centered state icons.

There are at least 13 distinct radius expressions and 237 literal color declarations across global/layout/page SCSS. Radius variation itself is not wrong, but most differences do not currently encode a documented hierarchy.

### Responsive patterns

- Public grids collapse to one column between 720px and 760px; additional tuning appears at 620px, 430px, and 380px.
- Administrator navigation switches at 900px, with page-specific breakpoints commonly at 720px and 600px.
- The member card becomes edge-to-edge below 520px.
- The tested pages had no horizontal overflow at 390px, 820px, or 1440px.
- The mobile administrator content reserves bottom space for the fixed navigation. The public sticky WhatsApp control does not reserve an equivalent focus/content exclusion zone.

## Evidence coverage

| Surface | State | Viewport(s) | Evidence method | Limitation |
|---|---|---|---|---|
| Public home | Default/local content | Mobile, tablet, desktop | Playwright full-page capture, DOM measurements, code inspection | Below-fold lazy images do not all load in a single unscrolled full-page capture; image sources and rendered scrolled examples were also inspected |
| Public services | Default | Mobile, tablet, desktop | Playwright and code inspection | Availability/quoting remains intentionally handled through WhatsApp |
| Public gallery | Default | Mobile, tablet, desktop | Playwright and code inspection | Same lazy-image capture limitation as home |
| Public contact | Default | Mobile, tablet, desktop | Playwright and code inspection | No external WhatsApp navigation was opened |
| Public gift card | Default populated amount and empty-submit validation | Mobile, tablet, desktop | Playwright, existing keyboard/error test, implementation inspection | The external WhatsApp handoff was not completed |
| Administrator login | Local transitional access | Mobile, tablet, desktop | Playwright | Production Cognito-hosted UI was not exercised |
| Administrator shell/Inicio | Local demo summary | Mobile, tablet, desktop | Playwright and existing navigation tests | Local records are repository demo records, not production data |
| Club administration | Safe unconfigured state | Mobile, tablet, desktop | Playwright | This is the normal local configuration state, not production connectivity |
| Club administration | Selected client, balance, active access, ledger | Mobile and desktop | Browser-only Angular development-mode signal injection using `Mariana Solís` and `Sofía Rivera` | No API mutation; invitation/reset/visit completion was inspected in code rather than executed |
| Inventory | Populated local list, low-stock badges, empty movements | Mobile, tablet, desktop | Playwright and code inspection | Local demo inventory only |
| Member Club | Invalid/no-link | Mobile, tablet, desktop | Playwright | No client data involved |
| Member Club | Enrollment | Mobile, tablet, desktop | Canonical synthetic access/invitation tokens; Playwright | Enrollment request not sent |
| Member Club | NIP login | Mobile, tablet, desktop | Canonical synthetic access handle; Playwright | Login request not sent |
| Member Club | Active session | Mobile and desktop | Browser-only injection into the in-memory session service | Session was synthetic and did not access protected member data |

All 17 selected repository Playwright tests passed. They covered public landmarks/headings, keyboard focus, gift-card control names and inline invalid state, mobile control bounds, administrator adaptive navigation, Club local states, invitation URL scrubbing, and member mobile overflow.

## What already works

### Preserve the public site's real-work editorial core

The public site avoids stock-beauty imagery and names real services in plain Spanish. Large real-work photographs, Playfair headlines, wine text, and the specific Tehuacán/WhatsApp service model make it feel more like a local studio than a generic booking template. The public home hero is the clearest existing expression of Bella Mujer.

### Preserve direct, honest service language

Copy consistently explains that availability, diagnosis, price, and appointment confirmation happen by message. It avoids promising automated booking that does not exist. Service and gallery pages tell clients what reference information is useful.

### Preserve the adaptive administrator navigation model

The desktop sidebar and five-action mobile bottom bar are understandable adaptations of the same information architecture. `Cita` is visually prominent on mobile, Club remains directly reachable, and secondary destinations move into `Más`. No horizontal overflow was found at the tested widths.

### Preserve functional accessibility foundations

Public routes expose a named navigation, a `main` landmark, and one `h1`. Images have descriptive alt text and intrinsic dimensions. Primary controls accept keyboard focus. Form fields generally use Angular Material labeling or explicit labels, and async actions disable or change copy while running.

### Preserve Club's auditable state language

The Club UI clearly distinguishes current balance, access status, ledger history, and visit registration. Empty, loading, error, invitation, active, reset, retry, and replay-sensitive states are present in implementation. The rich synthetic state remained understandable without exposing internal profitability or letting the member mutate loyalty.

### Preserve security-driven member behavior

Invitation scrubbing, in-memory sessions, NIP autocomplete modes, logout, throttling language, and invalid-link handling reflect the confirmed security architecture. Visual redesign must not weaken these properties.

## Independent design pass 1 — `frontend-design`

### Diagnosis

The public site has a point of view; the product system does not yet carry it consistently. The strongest material is not the blush background or rounded cards—it is the evidence of craft: close crops of nails, lashes, makeup, hair texture, and a calm local voice. Phase 5F2 should make those qualities the identity source.

The current Playfair/Poppins, blush, wine, pill, and rounded-card combination is appropriate but familiar in beauty templates. It becomes distinctive only when paired with the real imagery and direct language. In administrator and member areas, where imagery is absent, the combination falls back to a generic Material product.

### Where the product feels template-derived

- General administrator pages use the common SaaS-card kit: every metric/list/empty state sits in a similarly rounded pale card with similar elevation.
- `BM` in a rounded wine square is a placeholder mark repeated across public, admin, login, and member contexts; it does not carry the craft or locality visible in the photography.
- Material icons such as `search`, `notifications`, `loyalty`, and `spa` carry most of the non-photographic personality.
- Public interior pages repeat the same eyebrow + large headline + paragraph + two actions + portrait image, followed by grids and a dark CTA panel. Coherence is good, but the route skeleton is becoming interchangeable.
- Club's large gradient hero is more branded, but the decorative circles and badge language are not derived from an identifiable Bella Mujer artifact.

### What is distinctive and should survive

- the wine family, subject to contrast-role correction;
- close, unapologetic real-work photography rather than abstract beauty imagery;
- large editorial typography on public pages;
- plain Mexican Spanish and a visible Tehuacán identity;
- the idea of progress and recognition in Club;
- the compact, task-first mobile administrator navigation; and
- white space around one strong moment rather than decoration everywhere.

### Candidate aesthetic concept: “editorial studio / working atelier”

This is a candidate for Phase 5F2, not a final design system.

**Color exploration**

| Candidate role | Candidate value | Intent |
|---|---:|---|
| Vino tinta | `#7a1838` | Candidate brand anchor; final role pairs require contrast testing |
| Ciruela profunda | `#35101f` | Editorial text/dark panel, not generic near-black |
| Porcelana rosada | `#fff7f9` | Light field that already belongs to Bella Mujer |
| Blanco estudio | `#ffffff` | Operational surface and visual rest |
| Rosa oxidada | `#b56f7d` | Secondary accent drawn from makeup/skin context |
| Arena metálica | `#b88a62` | Sparse detail accent, not a blanket luxury-gold signal |

Exact values must be contrast-tested and approved. The point is a controlled wine/plum system with one material accent, not more shades of pink.

**Type exploration**

- Keep Poppins/Playfair as the low-risk direction only if the scale, weights, and usage are made deliberate.
- In parallel, test one more ownable display face against a calm humanist sans. Do not simply replace Poppins with Inter; that would make operational screens more generic.
- Use the display face for one expressive title per view. Use the sans for all controls, data, status, and long text.
- Remove most uppercase eyebrows. Retain them only where they identify a real category or workflow stage.

**Layout concept**

```text
PUBLIC                              ADMIN / MEMBER
┌──────────────────────────────┐    ┌──────────┬───────────────────────┐
│ quiet brand + simple routes  │    │ compact  │ task title + action   │
├──────────────┬───────────────┤    │ nav      ├───────────────────────┤
│ decisive     │ one real-work │    │          │ primary work surface  │
│ editorial    │ image/crop    │    │          │ + contextual detail   │
├──────────────┴───────────────┤    │          ├───────────────────────┤
│ varied story rhythm; fewer   │    │          │ feedback / history    │
│ repeated equal cards         │    └──────────┴───────────────────────┘
└──────────────────────────────┘
```

Public content should remain predominantly left-aligned, with centered composition reserved for gallery/statement moments. Operational screens should be left-aligned and denser, with selection and detail maintaining a stable spatial relationship on large screens. Member Club can be more celebratory than admin, but its first bold element should eventually be progress, not a generic access card.

**Principles**

1. Show proof of craft before decoration.
2. Spend visual boldness once per screen.
3. Make operational priority visible without wrapping every region in a card.
4. Let Club progress use a Bella Mujer-specific mark only after an identity decision.
5. Use motion only for cause/effect, progress, and state change; never as a substitute for hierarchy.

### Self-critique of this direction

The initial temptation is a familiar cream/terracotta “premium spa” system. That would erase the existing wine identity and resemble unrelated wellness templates. A black-and-gold luxury direction would similarly overstate exclusivity and weaken the studio's warm accessibility. The revised candidate therefore stays close to the wine/plum field, makes real work the memorable element, and spends distinctiveness on composition, identity, and type rather than trend effects.

## Independent design pass 2 — `ui-ux-pro-max`

### Verified guidance applied

Targeted searches covered keyboard focus and form errors, responsive web layout, adaptive navigation, form feedback, typography, beauty color, touch targets, fixed-overlay focus, and Angular forms.

The applicable evidence supports:

- a focusable error summary plus retained inline errors for long failed forms;
- visible focus and protection from fixed overlays;
- explicit current-location semantics;
- web pointer targets of at least 24 CSS px, with larger touch-friendly controls on mobile;
- one clear primary action per state;
- no horizontal mobile scroll;
- input types that summon the appropriate mobile keyboard;
- stable loading/success/error feedback; and
- reactive, typed forms with errors shown after interaction.

The implementation already satisfies many of these basics. The audit therefore does not recommend replacing current controls solely to match the dataset.

### Design-system query assessment

The required exploratory query (`beauty studio local service premium warm`) recommended a black/white, motion-heavy, scroll-storytelling system with Playfair Display and Inter. A narrower beauty color query recommended pink plus lavender. Neither is accepted as project authority:

- black/white motion storytelling conflicts with Bella Mujer's established wine identity, warm accessibility, operational administrator needs, and reduced-motion restraint;
- pink/lavender is category-correct but visually interchangeable with many beauty products;
- Inter would be a safe interface face but would not on its own solve generic administrator presentation.

The useful part of the generated direction is its emphasis on strong image presentation, readable contrast, keyboard focus, and reduced-motion support. No output was persisted.

### Angular version caveat

All returned Angular stack records identify **Angular 22.x**, while this repository uses Angular 21.2.x. General recommendations about reactive forms, functional validators, touched-state errors, and typed controls align with the current code and are version-neutral. No Angular 22-specific API or migration recommendation is made in this audit.

### Disagreement between the two passes

`frontend-design` argues for stronger authorship, fewer default Material surfaces, and a distinctive composition derived from studio craft. The exploratory `ui-ux-pro-max` system leans toward a known luxury/motion pattern. The tradeoff is not “brand versus usability”: the recommended resolution is to use the systematic pass for behavior, accessibility, and state rules, while using the independent design pass to choose the actual Bella Mujer visual language. Motion-heavy black luxury and generic pink beauty are both rejected as primary directions.

## Consolidated findings

Confidence describes the strength of the observed evidence, not implementation certainty. Effort is a rough relative estimate for a future atomic remediation.

### Usability problems

| ID | Severity | Surface | Category | Observed evidence | User/product impact | Recommendation | Confidence | Effort |
|---|---|---|---|---|---|---|---|---|
| BM-UX-001 | High | Public gift card | Form recovery | On a failed submit, the 2,584px mobile form marks controls touched but leaves focus at the bottom submit button; required messages are far above. There is no linked error summary. | A keyboard, screen-reader, or mobile user may not discover why the request did not proceed. | Keep inline Material errors, add a focusable summary at the form start with links to invalid fields, and focus it after failed submit. | High | M |
| BM-UX-002 | High | Admin shell | Affordance/feedback | Desktop `Buscar` and `Notificaciones` are enabled icon buttons with accessible names but no click behavior. | Live-looking controls teach users that the interface is unreliable and waste attempts. | Implement the actions or render them explicitly unavailable with explanation; do not ship enabled no-op controls. | High | S–M |
| BM-UX-003 | Medium | Member invalid link | Error recovery | The state says “Solicita un nuevo enlace” but offers no WhatsApp/contact action or route back to the studio. | A member arriving from an expired/broken link reaches a dead end. | Provide a safe, prewritten WhatsApp recovery action and explain that the studio must issue a new private link; never put credentials in the message. | High | S |
| BM-UX-004 | Medium | Member active session | Expectation/copy | Footer copy says the session is in “la memoria de este dispositivo,” although refresh/new tab requires NIP again; success says the member can continue but exposes only logout before Phase 6. | Misstated persistence and a dead-end success state reduce trust. | Say that the session lives only in the current tab and is lost on refresh; until Phase 6, describe access as verified rather than promising a destination. Later provide one clear “Ir a Mi Club” action. | High | S |
| BM-UX-005 | Medium | Club admin local state | Progressive disclosure | The “Servicio no configurado” notice is followed by the entire 3,203px mobile workspace in empty/disabled form. | The primary diagnostic is diluted and the screen appears broken rather than intentionally unavailable. | In unconfigured/error states, present one concise recovery/diagnostic surface and collapse operational panels. | High | M |
| BM-UX-006 | Low | Club visit context | Content composition | Rich-state rendering concatenates the selected name and phone: `Mariana Solís238 000 0011`. | The confirmation sentence is harder to scan at the exact point where the operator verifies the client. | Place the phone in its own labeled line or insert an explicit separator/space. | High | S |

### Accessibility problems

| ID | Severity | Surface | Category | Observed evidence | User/product impact | Recommendation | Confidence | Effort |
|---|---|---|---|---|---|---|---|---|
| BM-UX-007 | High | Public home contact panel | Color contrast | `Ver contacto` renders in wine `#8a1e3f` on dark plum `#4b1026`, approximately **1.67:1**. | The secondary CTA is difficult to perceive and fails WCAG contrast for text and control state. | Use a tested light on-dark secondary treatment (white text/border or a light surface button) with visible focus/hover states. | High | S |
| BM-UX-008 | Medium | Public and admin shells | Keyboard/screen-reader navigation | Neither shell exposes a skip link, and route transitions do not visibly manage focus to the new page `h1`/main region. | Repeated navigation is costly for keyboard users; screen-reader users may not be told that route content changed. | Add skip-to-content links and a tested route-change focus/announcement strategy without breaking browser history. | High | M |
| BM-UX-009 | Medium | Admin desktop sidebar | Current-location semantics | Desktop links receive only the visual `active-link` class; unlike the mobile/public navigation, they do not set `aria-current="page"`. | Screen-reader users receive weaker location feedback than visual users. | Add current-page semantics to the desktop navigation and verify exactly one current item. | High | S |
| BM-UX-010 | Medium | Public sticky WhatsApp; admin bottom nav | Focus not obscured | Fixed controls occupy the lower viewport. Admin reserves content padding, but the public sticky WhatsApp action has no equivalent focus exclusion/scroll padding. | A focused link/control near the bottom can be partially hidden, particularly under zoom or small heights. | Test WCAG 2.2 focus-not-obscured at 200% zoom; add scroll padding/content inset or reposition/dismiss the floating action when it covers focus. | Medium | S–M |
| BM-UX-011 | Medium | Member NIP enrollment/login | Accessible authentication | Numeric NIP fields allow autocomplete/paste but provide no reveal control; failed multi-field enrollment marks errors without moving focus. | Members can make avoidable six-digit entry/confirmation errors, especially with low vision or motor/cognitive constraints. | Add an accessible show/hide NIP control and focus the first invalid field or a compact error summary after submit. Preserve paste and password-manager behavior. | Medium | M |
| BM-UX-012 | Medium | Public gift-card request error | Semantic visual feedback | The request-error block uses the green `.success` class while declaring `role="alert"`. | Failure can be visually read as success; status semantics are inconsistent for low-vision and scanning users. | Give error, success, warning, and informational feedback distinct semantic components/tokens, icons, and tested contrast. | High | S |

### Responsive problems

| ID | Severity | Surface | Category | Observed evidence | User/product impact | Recommendation | Confidence | Effort |
|---|---|---|---|---|---|---|---|---|
| BM-UX-013 | High | Club admin mobile | Task flow/information architecture | The rich state serializes directory, detail, access, create, history, and visit registration into one long page while a fixed bar consumes viewport space. Related selection and action contexts are separated by several screens of scrolling. | Fast studio tasks become slow and error-prone; the operator can lose client context before registering a visit or resetting access. | Design a mobile task model for Phase 5F2: persistent selected-client context plus explicit subviews/tabs or progressive task panels. Keep deep links/back behavior and do not hide audit history. | High | L |
| BM-UX-014 | Medium | Public shell mobile | Navigation | Five pill links wrap into two rows at 390px; the header action disappears and the header consumes a large, irregular block. | Navigation remains usable but visually crowded and scales poorly with longer labels/text size. | Test a simpler mobile header (compact menu or prioritized routes) while keeping WhatsApp available within one tap and preserving all named links. | High | M |
| BM-UX-015 | Medium | Inventory tablet/desktop | Adaptive layout | At 820px and 1440px, a long inventory list occupies the left column while an empty “Movimientos recientes” card consumes the full right column height/width. | Half the work area is wasted and stock scanning becomes unnecessarily long. | Let the empty secondary panel collapse, span, or become a compact state; use the second column only when movement content exists. | High | S–M |
| BM-UX-016 | Medium | Public home/gallery mobile | Content priority | Measured full-page heights were about 10,683px for home and 8,159px for gallery at 390px. The home repeats a substantial gallery and the gallery then repeats the full set. | Core conversion actions compete with a long image/card stack; repeat visitors do more scrolling than necessary. | Curate fewer home previews, add a clear gallery handoff, and consider progressive disclosure/filtering on the gallery without hiding meaningful content from assistive technology. | High | M |

### Visual and brand problems

| ID | Severity | Surface | Category | Observed evidence | User/product impact | Recommendation | Confidence | Effort |
|---|---|---|---|---|---|---|---|---|
| BM-UX-017 | High | Cross-product, especially general admin | Brand coherence | Public routes are image-led/editorial; general admin is a uniform pale Material dashboard; Club admin is a third, more decorative language. | Users experience separate products rather than one studio system, and future Phase 6 work lacks a dependable visual parent. | In Phase 5F2 define one brand grammar with three deliberate modes: editorial public, task-dense admin, progress-led member. Share type/color/state/identity, not identical page composition. | High | L |
| BM-UX-018 | Medium | Public interior routes | Composition | Services, gallery, and contact use nearly identical hero and section formulas; repeated eyebrows and dark CTA panels appear regardless of content type. | Coherence drifts toward template sameness and reduces each route's information character. | Keep shared foundations but give each route a content-specific organizing idea: service decision support, visual browsing, and contact preparation. | High | M |
| BM-UX-019 | Medium | All shells/member access | Identity | The primary brand asset is `BM` text in a rounded wine square. Member access contains no studio-work cue beyond palette/type. | The most sensitive/trust-dependent flow looks like a generic loyalty login and is easy to confuse with unrelated products. | Decide whether to commission/adopt an official mark. Until then, treat the monogram as a utility avatar, not a finished logo; use restrained brand copy or imagery where appropriate. | High | M–L |
| BM-UX-020 | Medium | Club admin | Hierarchy/density | The hero is memorable but occupies a large portion of mobile before any task; nearly every subsequent state is another rounded white card. | Brand presentation delays operational work and card repetition flattens hierarchy. | Retain one Club signature moment, compact it after entry/selection, and replace some nested cards with grouped rows, dividers, or master-detail structure. | High | M |

### Design-system inconsistencies

| ID | Severity | Surface | Category | Observed evidence | User/product impact | Recommendation | Confidence | Effort |
|---|---|---|---|---|---|---|---|---|
| BM-UX-021 | High | Cross-product styles | Token authority | Material starts from Azure/blue, selected `--mat-sys-*` values are manually replaced, four public pages redeclare six local colors, and the audited SCSS contains 237 literal color declarations plus at least 13 radius expressions. | A change can fix one route and regress another; new Phase 6 components have no reliable source of truth. | In Phase 5F2 inventory roles first, then define one generated/semantic Material-compatible token layer with documented surface, text, action, state, radius, elevation, spacing, and motion roles. Migrate atomically later—do not bulk replace values in 5F2. | High | L |
| BM-UX-022 | Medium | Typography across product | Type roles | Poppins is loaded only through weight 600 while CSS asks for 700/800 in 33 declarations; type sizes and uppercase labels are page-owned rather than role-owned. | Synthesized weights and ad hoc roles reduce polish and make accessibility scaling harder to predict. | Choose explicit display/body/data/label roles, load only the real weights used, and reduce sub-12px/uppercase label reliance. | High | M |

### Implementation-level concerns

| ID | Severity | Surface | Category | Observed evidence | User/product impact | Recommendation | Confidence | Effort |
|---|---|---|---|---|---|---|---|---|
| BM-UX-023 | Medium | Public routes and Club admin | Maintainability/UI state consistency | Four public SCSS files repeat the same token, shell, eyebrow, heading, intro, and CTA patterns. Club admin is approximately 1,071 TS + 932 HTML + 556 SCSS lines in one route component. | Repeated fixes can diverge; the Club component's many asynchronous states are difficult to review visually and accessibly as a unit. | After direction approval, extract semantic primitives and focused feature components by state/workflow. Do not create a generic card abstraction for every region. | High | L |
| BM-UX-024 | Low | Gift card and Club client forms | Mobile input ergonomics | Phone controls specify autocomplete in Club but remain default text inputs; gift-card phone fields also omit `type="tel"`/appropriate input mode. | Mobile users may receive a less useful keyboard and make more formatting errors. | Use semantic telephone input types/input modes while retaining server validation and permissive international/local formatting. | High | S |

## Cross-product findings

The following should be solved at system, token, shell, or component level rather than page by page:

1. **Token authority:** BM-UX-021 and BM-UX-022 require a defined source of truth before Phase 6 visual work.
2. **Navigation accessibility:** BM-UX-008, BM-UX-009, and BM-UX-010 belong in shells/router behavior.
3. **Feedback semantics:** BM-UX-001 and BM-UX-012 need shared success/error/summary patterns, not gift-card-only styling.
4. **Brand modes:** BM-UX-017 and BM-UX-019 require one identity decision expressed differently across public, admin, and member contexts.
5. **Surface hierarchy:** BM-UX-020 and BM-UX-023 should reduce card-by-default composition through shared grouping rules.
6. **Mobile task structure:** BM-UX-013 should establish the member/admin mobile IA pattern before the Phase 6 member surface expands.

## Surface-specific synthesis

### Public website

Preserve the hero, photography, honest copy, and WhatsApp-first conversion. Correct the home CTA contrast immediately. Shorten the home gallery preview, simplify mobile navigation, and let services/gallery/contact use content-specific compositions instead of the same page skeleton.

### General administrator experience

Preserve the adaptive sidebar/bottom-nav model and compact task labels. Remove or implement no-op toolbar controls, reduce equal-weight cards, and give each screen a visible primary job. Empty secondary data should not reserve half a tablet/desktop page.

### Club administration

Preserve the branded hierarchy, explicit balance/access/history separation, and careful async/error states. Redesign the mobile workflow around a persistent selected client and task subviews. Compact the hero, reduce nested cards, and make visit registration the fastest deliberate action after selection.

### Member access

Preserve invitation scrubbing and in-memory security behavior. Add safe invalid-link recovery, accurate tab-session copy, NIP reveal/focus assistance, and a stronger but restrained identity. Do not invent Phase 6 features inside the access flow.

## Candidate direction for Phase 5F2

The strongest candidate is **editorial studio / working atelier**:

- public pages lead with real work and editorial composition;
- administrator pages become a calm, compact workbench with stronger selection, status, and action hierarchy;
- member Club becomes progress-led and celebratory, using a Bella Mujer-specific stamp/mark only after approval;
- Material remains the interaction/accessibility substrate, with appearance controlled through reviewed semantic tokens and composed primitives;
- wine/plum remains the brand anchor, but pink is not used as the answer to every hierarchy problem;
- motion is limited to task feedback, selection/detail continuity, and Club progress, with reduced-motion support.

Two alternatives should be tested, not adopted blindly:

1. **Refined continuity:** keep Playfair/Poppins and current palette, but correct roles, hierarchy, identity, and composition. Lower implementation risk, lower distinctiveness gain.
2. **Type-led evolution:** retain wine/plum and photography while testing a more ownable display/sans pairing and a less card-dependent layout. Higher brand gain, higher migration and approval cost.

The audit does **not** recommend a black/gold luxury reset, a pink/lavender category template, glassmorphism, decorative parallax, or “keep Material and only polish spacing.”

## Priority map

### Fix before Phase 6

- BM-UX-001 — recoverable, focusable gift-card validation;
- BM-UX-002 — remove/implement enabled no-op admin controls;
- BM-UX-007 — correct the confirmed 1.67:1 CTA contrast failure;
- BM-UX-008 and BM-UX-009 — shell/route navigation semantics;
- BM-UX-003 and BM-UX-004 — truthful, recoverable member access states;
- BM-UX-013 — approve a mobile Club task model before adding member Club surfaces;
- BM-UX-017 and BM-UX-021 — approve brand modes and token authority before new Phase 6 UI establishes more patterns.

### Should improve before Phase 6

- BM-UX-010 through BM-UX-012 — focus protection, NIP assistance, and feedback semantics;
- BM-UX-014 — public mobile navigation;
- BM-UX-019 and BM-UX-020 — identity treatment and Club density;
- BM-UX-022 — explicit typography roles/weights;
- BM-UX-023 — extract only the primitives/components needed by approved remediation.

### Can defer

- BM-UX-005 — local unconfigured Club presentation, if production configuration remains reliably present;
- BM-UX-006 — selected-client sentence spacing;
- BM-UX-015 — inventory empty-column adaptation;
- BM-UX-016 and BM-UX-018 — public content length/compositional differentiation;
- BM-UX-024 — telephone keyboard optimization.

### Preserve as-is

- confirmed product behavior and security boundaries;
- public real-work imagery and Tehuacán/WhatsApp specificity;
- one `h1`, named public navigation, meaningful alt text, and intrinsic image dimensions;
- administrator sidebar/mobile bottom-nav information architecture;
- responsive absence of horizontal overflow at tested viewports;
- Club ledger/balance/access separation and retry-safe state language;
- Material form/control behavior where it already supplies accessible interaction.

## Questions and decisions for Phase 5F2

1. Is `BM` a temporary monogram, or is there an approved logo/mark that can anchor public, admin, Club, and future stamps?
2. Does the team prefer refined continuity or a more visible type-led evolution?
3. Which qualities must remain unmistakable: wine color, Playfair, blush surfaces, photography style, or a combination?
4. Should public, admin, and member products share identical typography, or share a family with deliberately different display roles?
5. Is WCAG 2.2 AA the explicit acceptance baseline for Phase 5F3?
6. On mobile Club admin, should selection open a client workspace with tabs/subroutes, an accordion task flow, or a dedicated client route?
7. Should `Buscar` and `Notificaciones` be implemented soon, removed, or shown as clearly unavailable future functions?
8. Should public mobile navigation remain fully visible or move behind a compact menu while keeping WhatsApp one tap away?
9. How much client-identifying information should remain visible in shared studio contexts, especially the Inicio recent-client list?
10. What exact member destination and CTA should appear after successful session verification in Phase 6?
11. Is a Bella Mujer-specific Club stamp/loyalty mark available, or should its design be commissioned as a separate approved asset?
12. Which administrator screens need dense tablet-first operation at the physical studio, and which are primarily desktop management tools?

## Audit closure statement

This document records evidence and candidate direction only. It does not finalize a design system, approve a logo or typeface, implement remediation, change product behavior, deploy code, or begin Phase 5F2/Phase 6.
