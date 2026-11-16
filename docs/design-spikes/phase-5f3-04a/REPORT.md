# Phase 5F3-04A — design / token / typography spike

Status: **recommendation ready for human review; no production implementation**
Required base: `3887bef30598724bbd6d45f98f866bd01926e198`
Prepared: 2026-11-14
Findings supported: BM-UX-017, BM-UX-021, BM-UX-022

## Decision summary

- Preserve the locked **editorial studio / working atelier** direction and the public/editorial,
  admin/workbench, and member/progress modes.
- Use one authority: private reference values → Bella Mujer semantic roles → Angular Material system
  mappings → rare component roles.
- Recommend **Newsreader + Source Sans 3**. Do not activate either candidate in the product until the
  human gate in this report is approved.
- Treat the palette values below as contrast-tested candidates, not final brand approval.
- Keep Angular Material for control behavior, state layers, structure, and accessibility semantics.
- Keep default composition flat. Reserve elevation for raised work surfaces and overlays.
- Preserve Phase 5F3-03 skip links, route focus, current-page semantics, focus-not-obscured behavior,
  and 200% zoom reflow.

### Source caveat

The global `Software_Workflow.md` is intentionally maintained outside the repository in ChatGPT Library.
Its absence from the Codex workspace is expected; it was not recreated or edited here.

The local `ui-ux-pro-max` design-system query returned the already rejected black/white,
motion-driven, Playfair/Inter direction. It was not persisted or applied. Only its verified semantic
token, contrast, focus, responsive, font-loading, and Angular Material guidance informed this spike;
the Bella Mujer direction document remains authoritative.

## A. Current-authority inventory

### A1. Material and global authority

`src/styles.scss` currently initializes Material from a non-brand palette:

```scss
@include mat.theme((
  color: (
    primary: mat.$azure-palette,
    tertiary: mat.$blue-palette,
  ),
  typography: Poppins,
  density: 0,
));
```

It then manually replaces 12 generated system roles:

| Current variable | Current value |
|---|---:|
| `--mat-sys-primary` | `#8a1e3f` |
| `--mat-sys-on-primary` | `#ffffff` |
| `--mat-sys-primary-container` | `#f8d0d7` |
| `--mat-sys-on-primary-container` | `#4b1026` |
| `--mat-sys-secondary` | `#f8d0d7` |
| `--mat-sys-on-secondary` | `#4b1026` |
| `--mat-sys-secondary-container` | `#ffe5ea` |
| `--mat-sys-on-secondary-container` | `#4b1026` |
| `--mat-sys-surface` | `#fff7f9` |
| `--mat-sys-surface-container` | `#ffffff` |
| `--mat-sys-surface-container-low` | `#fff7f9` |
| `--mat-sys-surface-container-high` | `#fdf0f3` |

This leaves Azure/blue generation, hand-edited Material variables, and Bella Mujer values as parallel
authorities. The comment saying “Material system values remain unchanged” is contradicted by the 12
preceding overrides.

### A2. Partial Bella Mujer roles

| Current role | Current value / relationship | Limitation |
|---|---|---|
| `--bm-brand-wine` | `#8a1e3f` | Primitive and action role are conflated. |
| `--bm-brand-rose` | `#a98585` | No approved usage or foreground pairing. |
| `--bm-brand-sand` | `#c09579` | No approved usage or foreground pairing. |
| `--bm-brand-blush` | `#fffafa` | Named as brand, used as surface. |
| `--bm-surface-accent` | 7% wine mixed with white | Useful relationship, incomplete surface model. |
| `--bm-border-soft` | 14% wine mixed with transparent | Composition-dependent and not an interactive boundary. |
| `--bm-text-muted` | `#6b5b66` | One text role cannot cover primary/secondary/inverse/link. |
| `--bm-radius-card` | `24px` | Encodes card-by-default language. |
| `--bm-radius-soft` | `16px` | Object meaning is undefined. |
| `--bm-shadow-soft` | wine-tinted `0 16px 40px` | Used as brand decoration rather than semantic elevation. |

### A3. Page-local and raw values

- Public home, services, gallery, and contact each repeat `--wine`, `--dark`, `--blush`, `--soft`,
  `--sage`, and `--gold`: 24 local aliases in total.
- The public home additionally uses raw white, blush, plum, translucent borders, shadows, and two
  decorative gradients. Its page-local aliases directly drive text, actions, badges, and surfaces.
- The member access surface mixes partial `--bm-*` roles with raw error (`#7b1b2d`, `#fde7eb`), success
  (`#317044`), white, and fallback values.
- The exact-base inventory contains 277 raw hex/rgb(a) occurrences in SCSS. This is an inventory signal,
  not a request for blind replacement.
- Radii and shadows remain route/component owned, so they do not consistently communicate object type
  or elevation.

### A4. Font loading and synthetic-weight defect

The product loads:

```text
Playfair Display: 400, 600, 700
Poppins: 300, 400, 500, 600
font-display: swap
```

At this base, component SCSS contains 35 requests for weight 700, 800, or 900. Playfair has a real 700,
but Poppins stops at 600, and neither family request supplies 800/900. Any Poppins 700/800/900 and any
Playfair 800/900 are synthetic. The global `mat.theme` typography declaration also knows only the family,
not the explicit Bella Mujer role weights.

## B. Proposed minimal semantic token architecture

### B1. Authority and naming

```text
private Sass reference values
        ↓
public --bm-* semantic roles
        ↓
mat.theme(..., $overrides: (...)) / component mappings
        ↓
rare --bm-component-* roles, only when justified
```

Reference values are implementation inputs and must not be emitted for route consumption. Routes use
semantic roles only. A new semantic role needs two real consumers or one essential system state. A rare
component role must record why an existing semantic role is insufficient.

### B2. Smallest coherent reference palette

These are **TEST IN IMPLEMENTATION** candidates. Wine/plum/blush/white/rose/material accent are the
brand family; green/amber/red/blue exist only to make essential system states unambiguous and accessible.

| Private reference | Candidate | Intended derivation |
|---|---:|---|
| wine 700 | `#7A1838` | Primary brand/action anchor |
| wine 800 | `#67122F` | Primary hover |
| wine 900 | `#541027` | Primary pressed |
| plum 950 | `#35101F` | Ink, inverse surface, strongest brand value |
| porcelain blush 050 | `#FFF7F9` | Canvas and inverse text |
| studio white | `#FFFFFF` | Operational and raised surface |
| oxidized rose 500 | `#B56F7D` | Sparse non-text accent; not normal text on white (3.79:1) |
| warm material 500 | `#B88A62` | Sparse material detail; not normal text on white (3.07:1) |
| green 700 / 050 | `#1F633D` / `#EAF7EF` | Success foreground/surface |
| amber 800 / 050 | `#704500` / `#FFF3D6` | Warning foreground/surface |
| red 700 / 050 | `#8C1D2C` / `#FDEDEF` | Error/destructive foreground/surface |
| blue 700 / 050 | `#155E85` / `#EAF5FB` | Information foreground/surface |
| focus blue | `#0B63A5` | Focus ring on light surfaces |
| focus amber | `#FFD27A` | Focus ring on inverse/brand surfaces |

The warm accent is not “gold luxury”; it is a sparse material note. Oxidized rose and warm material may
decorate a rule, progress detail, or non-text indicator only when the indicator also has text/shape.

### B3. Color roles

Classification: `S` semantic, `M` Material mapping target. Primitive values above stay private.

| Semantic role | Purpose and representative consumer | Candidate / relationship | Pair and requirement | Material mapping | Class |
|---|---|---|---|---|---|
| `--bm-brand-primary` | Recognition and primary action; WhatsApp/action fill | wine 700 | `--bm-on-brand`, 4.5:1 text | `primary` | S/M |
| `--bm-brand-strong` | Ink-strength brand surface; member signature moment | plum 950 | `--bm-text-inverse`, 4.5:1 | `inverse-surface` where applicable | S/M |
| `--bm-brand-soft` | Selected row or restrained brand container | `#F7DDE4` | `--bm-on-brand-soft`, 4.5:1 | `primary-container` | S/M |
| `--bm-on-brand-soft` | Text on soft brand container | `#5B102A` | brand soft, 4.5:1 | `on-primary-container` | S/M |
| `--bm-brand-accent-rose` | Sparse decorative/craft cue | rose 500 | non-text 3:1 when meaningful; never alone | none | S |
| `--bm-brand-accent-material` | Sparse material/progress detail | warm material 500 | plum text gives 5.50:1 | `tertiary` | S/M |
| `--bm-on-brand` | Text/icon on primary fill | studio white | brand primary, 4.5:1 text/3:1 icon | `on-primary` | S/M |
| `--bm-surface-canvas` | Application/page canvas | blush 050 | primary/secondary/muted text all 4.5:1 | `surface`, `background` fallback | S/M |
| `--bm-surface` | Flat content/work surface | studio white | primary/secondary text 4.5:1 | `surface-container-low` | S/M |
| `--bm-surface-raised` | Genuinely raised work surface | studio white + raised elevation | primary text 4.5:1 | `surface-container` | S/M |
| `--bm-surface-subtle` | Sunken/grouped region | `#F8EEF1` | primary text 14.85:1 | `surface-container-high` | S/M |
| `--bm-surface-inverse` | One restrained signature/dark region | plum 950 | inverse text 4.5:1 | `inverse-surface` | S/M |
| `--bm-surface-scrim` | Dialog/modal isolation | `rgb(53 16 31 / 56%)` | measure composed result | `scrim` | S/M |
| `--bm-text-primary` | Headings and primary body | plum 950 | canvas/surface, 4.5:1 | `on-surface` | S/M |
| `--bm-text-secondary` | Supporting body and descriptions | `#6A4C58` | canvas/surface, 4.5:1 | `on-surface-variant` | S/M |
| `--bm-text-muted` | Metadata/captions, never disabled substitute | `#765B66` | canvas 5.76:1 | component mapping as needed | S |
| `--bm-text-inverse` | Text on inverse surface | blush 050 | inverse surface, 4.5:1 | `inverse-on-surface` | S/M |
| `--bm-text-link` | Inline links | wine 700 plus underline | canvas/surface, 4.5:1 | none | S |
| `--bm-action-primary` | One primary action per state | wine 700 | white, 4.5:1 | `primary` | S/M |
| `--bm-action-primary-hover` | Hover state without layout shift | wine 800 | white, 4.5:1 | button state mapping | S/M |
| `--bm-action-primary-pressed` | Pressed state | wine 900 | white, 4.5:1 | button state mapping | S/M |
| `--bm-action-secondary` | Outlined/tonal secondary action | wine 700 foreground | canvas/surface, 4.5:1 | `secondary` or component override | S/M |
| `--bm-action-secondary-hover-surface` | Secondary hover state | brand soft | wine 800, 4.5:1 | state layer/container | S/M |
| `--bm-action-quiet` | Low-emphasis text action | text secondary + underline/state layer | canvas/surface, 4.5:1 | component mapping | S/M |
| `--bm-action-destructive` | Destructive action/confirmation | error foreground | white or error surface, 4.5:1 | `error` | S/M |
| `--bm-action-disabled-opacity` | Disabled visual de-emphasis | `0.38` with semantic `disabled` state | no text contrast promise; must be programmatically disabled | Material disabled opacity | S/M |
| `--bm-border-subtle` | Decorative grouping/dividers | `#E2CBD2` | no information/control boundary | `outline-variant` | S/M |
| `--bm-border-standard` | Stronger grouping | `#C9AEB7` | not sole control boundary | component mapping | S/M |
| `--bm-border-interactive` | Input/control boundary | `#765B66` | white 6.07:1, ≥3:1 non-text | `outline` | S/M |
| `--bm-border-strong` | Selection/current state with shape/text | wine 700 | ≥3:1 plus non-color cue | component mapping | S/M |
| `--bm-success-surface` | Completed operation/status background | green 050 | success foreground 4.5:1 | component mapping | S |
| `--bm-success-foreground` | Success text | green 700 | success surface 6.55:1 | component mapping | S |
| `--bm-success-indicator` | Icon/border paired with success text | green 700 | ≥3:1 non-text | component mapping | S |
| `--bm-warning-surface` | Recoverable caution background | amber 050 | warning foreground 4.5:1 | component mapping | S |
| `--bm-warning-foreground` | Warning text | amber 800 | warning surface 7.50:1 | component mapping | S |
| `--bm-warning-indicator` | Icon/border paired with warning text | amber 800 | ≥3:1 non-text | component mapping | S |
| `--bm-error-surface` | Error summary/field alert background | red 050 | error foreground 4.5:1 | `error-container` | S/M |
| `--bm-error-foreground` | Error/destructive text | red 700 | error surface 7.97:1 | `error`, `on-error-container` | S/M |
| `--bm-error-indicator` | Icon/border paired with error text | red 700 | ≥3:1 non-text | component mapping | S |
| `--bm-info-surface` | Neutral service/system information | blue 050 | info foreground 4.5:1 | component mapping | S |
| `--bm-info-foreground` | Information text | blue 700 | info surface 6.38:1 | component mapping | S |
| `--bm-info-indicator` | Icon/border paired with information text | blue 700 | ≥3:1 non-text | component mapping | S |
| `--bm-focus-ring` | 3px focus ring on light surfaces | focus blue | canvas 5.96:1 | shared focus/component mapping | S/M |
| `--bm-focus-ring-inverse` | 3px ring on inverse/brand surfaces | focus amber | inverse 11.85:1; brand 7.32:1 | shared focus/component mapping | S/M |
| `--bm-focus-offset` | Separates ring from component fill | studio white on dark; canvas on light | verify composed two-color indicator | shared focus rule | S/M |

Success, warning, error, information, selected, and progress states always include text and/or icon/shape.
State color is supplementary.

### B4. Radius, elevation, spacing, and motion

| Role | Purpose | Candidate / relationship | Representative consumer | Material mapping | Class |
|---|---|---|---|---|---|
| `--bm-radius-control` | Buttons, fields, compact utility tile | `8px` | Material button/form field, `BM` utility monogram | small shape/component override | S/M |
| `--bm-radius-group` | Grouped work surface/image crop | `12px` | admin workspace, public image | medium shape/component override | S/M |
| `--bm-radius-overlay` | Dialog/sheet/menu where appropriate | `16px` | dialog/sheet, not every card | extra-large shape/component override | S/M |
| `--bm-elevation-flat` | Default grouping | `none` | rows, sections, most admin groups | level 0 | S/M |
| `--bm-elevation-raised` | Genuinely raised work surface | `0 8px 24px rgb(53 16 31 / 10%)` | floating task panel only | low elevation | S/M |
| `--bm-elevation-overlay` | Dialog/menu/overlay separation | `0 18px 48px rgb(53 16 31 / 18%)` | modal/dialog | overlay elevation | S/M |
| `--bm-space-1` | Base step | `4px` | icon/text micro-gap | none | S |
| `--bm-space-2` | Compact rhythm | `8px` | related labels/status | none | S |
| `--bm-space-3` | Control rhythm | `12px` | field/button internal and adjacent gap | density/component mapping | S/M |
| `--bm-space-4` | Content rhythm | `16px` | body/group inset | none | S |
| `--bm-space-6` | Group rhythm | `24px` | work-surface grouping | none | S |
| `--bm-space-8` | Compact section rhythm | `32px` | admin section separation | none | S |
| `--bm-space-12` | Content section rhythm | `48px` | member/public section | none | S |
| `--bm-space-16` | Generous editorial rhythm | `64px` | public section on wide screens | none | S |
| `--bm-motion-instant` | Reduced/structural state | `0ms` | reduced-motion rendering | reduced motion | S/M |
| `--bm-motion-feedback` | Press/selection feedback | `120ms` | button, row selection | Material state transition | S/M |
| `--bm-motion-enter` | Necessary overlay/content arrival | `180ms` | menu/dialog only | component motion | S/M |
| `--bm-motion-exit` | Faster overlay/content exit | `120ms` | menu/dialog only | component motion | S/M |
| `--bm-ease-standard` | Decelerating arrival/feedback | `cubic-bezier(.2, 0, 0, 1)` | feedback and overlay arrival | component motion | S/M |
| `--bm-ease-exit` | Accelerating departure | `cubic-bezier(.4, 0, 1, 1)` | overlay exit | component motion | S/M |

Under `prefers-reduced-motion: reduce`, feedback remains visible but transitions resolve immediately;
spinners may use a non-motion status alternative. No correctness, focus movement, status, or content
availability depends on an animation-end event. No decorative entrance system is proposed.

### B5. Three modes from the same roles

| Mode | Expression of the shared system |
|---|---|
| Public | Canvas plus real-work photography; one expressive title; 48–64px section rhythm; flat open sections; sparse framed regions. |
| Admin | White/subtle surfaces; interface face dominant; 24–32px grouping; rows/dividers before cards; tabular data; expressive face absent from controls and operational data. |
| Member | One inverse/plum signature region; expressive greeting/progress title; comfortable 32–48px rhythm; progress/status always includes text and structure. |

This is one brand grammar, not three themes. `BM` remains a small utility monogram paired with the visible
Bella Mujer name where trust matters.

### B6. Material relationship

Use Angular Material 21's supported theme override input during theme emission, not a later hand-written
block of unrelated `--mat-sys-*` edits. The Sass modules own the private references and semantic map;
`mat.theme(..., $overrides: (...))` emits Material system roles from that map. Material continues to own
control structure, ripples/state layers, keyboard behavior, menus, dialogs, form semantics, and disabled
semantics.

| Material system family | Bella Mujer authority |
|---|---|
| `primary`, `on-primary` | action primary / on-brand |
| `primary-container`, `on-primary-container` | brand soft / on-brand-soft |
| `secondary`, `on-secondary` | brand strong / text inverse |
| `secondary-container`, `on-secondary-container` | surface subtle / text primary |
| `tertiary`, `on-tertiary` | material accent / text primary (5.50:1) |
| `error`, `on-error` | error foreground / studio white (9.02:1) |
| `error-container`, `on-error-container` | error surface / error foreground |
| surface/container levels | canvas, surface, raised, subtle according to elevation meaning |
| `on-surface`, `on-surface-variant` | text primary / text secondary |
| `outline`, `outline-variant` | border interactive / border subtle |
| `inverse-surface`, `inverse-on-surface` | surface inverse / text inverse |
| `inverse-primary` | focus inverse where Material needs a light inverse accent |
| `scrim` | surface scrim |
| shape/elevation/state roles | semantic radius/elevation/motion mappings above |

The initial Material palette argument may exist only as a Sass generation requirement; every emitted
creative role used by components must be overridden from the Bella Mujer semantic map in the same theme
module. It is not exposed or documented as an application palette. A component override is permitted
only when a specific Material component cannot express an approved semantic role through system tokens.

## C. Contrast matrix

Ratios use WCAG relative luminance on the exact candidate hex values. Normal text requires 4.5:1; large
text and meaningful non-text UI require 3:1. Focus uses a 3px indicator and is tested against the
immediately adjacent surface. Disabled controls are programmatically disabled and are not used to carry
essential information.

| Use | Foreground | Background | Ratio | Assigned use | Result |
|---|---:|---:|---:|---|---|
| Primary text / canvas | `#35101F` | `#FFF7F9` | 16.00:1 | Any text | Pass AA/AAA |
| Secondary text / canvas | `#6A4C58` | `#FFF7F9` | 7.15:1 | Any text | Pass AA/AAA |
| Muted text / canvas | `#765B66` | `#FFF7F9` | 5.76:1 | Caption/metadata | Pass AA |
| Inverse text / inverse surface | `#FFF7F9` | `#35101F` | 16.00:1 | Any text | Pass AA/AAA |
| Primary action default | `#FFFFFF` | `#7A1838` | 10.42:1 | Button text/icon | Pass AA/AAA |
| Primary action hover | `#FFFFFF` | `#67122F` | 12.32:1 | Button text/icon | Pass AA/AAA |
| Primary action pressed | `#FFFFFF` | `#541027` | 14.19:1 | Button text/icon | Pass AA/AAA |
| Secondary action default | `#7A1838` | `#FFF7F9` | 9.89:1 | Text/border on canvas | Pass AA/AAA |
| Secondary action hover | `#67122F` | `#F7DDE4` | 9.63:1 | Text on tonal state | Pass AA/AAA |
| Secondary action pressed | `#541027` | `#F0CBD5` | 9.60:1 | Text on tonal state | Pass AA/AAA |
| Destructive filled action | `#FFFFFF` | `#8C1D2C` | 9.02:1 | Button text/icon | Pass AA/AAA |
| Error text / error surface | `#8C1D2C` | `#FDEDEF` | 7.97:1 | Normal text | Pass AA/AAA |
| Success text / success surface | `#1F633D` | `#EAF7EF` | 6.55:1 | Normal text | Pass AA |
| Warning text / warning surface | `#704500` | `#FFF3D6` | 7.50:1 | Normal text | Pass AA/AAA |
| Information text / info surface | `#155E85` | `#EAF5FB` | 6.38:1 | Normal text | Pass AA |
| Interactive border / white surface | `#765B66` | `#FFFFFF` | 6.07:1 | Control boundary | Pass 3:1 |
| Focus ring / light canvas | `#0B63A5` | `#FFF7F9` | 5.96:1 | 3px focus indicator | Pass 3:1 |
| Focus ring / dark inverse | `#FFD27A` | `#35101F` | 11.85:1 | 3px focus indicator | Pass 3:1 |
| Focus ring / brand surface | `#FFD27A` | `#7A1838` | 7.32:1 | 3px focus indicator | Pass 3:1 |

Oxidized rose on white is 3.79:1 and warm material on white is 3.07:1. Neither may carry normal text.
The existing home `#8a1e3f` text on `#4b1026` remains a known 1.67:1 failure already addressed by the
preceding slice; the new authority must not reintroduce it.

## D. Typography comparison

### D1. Shared role rules

| Role | Shared behavior |
|---|---|
| Expressive/display | Expressive face, 600, one signature public/member moment, tight but not decorative tracking |
| Page title | Expressive 500–600 for public/member; interface 700 for admin orientation |
| Section title | Interface 700 by default; expressive 500 only for a real editorial section |
| Body | Interface 400, 1.55–1.7 line height, desktop measure about 60–75 characters |
| Interface/control | Interface 600, sentence case, no decorative tracking |
| Data | Interface 600/700 with `font-variant-numeric: tabular-nums` where alignment matters |
| Label/caption | Interface 600, normally 13–14px equivalent, sentence case, remains readable at 200% |

No 800/900 role is proposed. `font-synthesis: none` makes missing files visible during validation rather
than silently manufacturing weight. Accents in “Tehuacán”, “atención”, “pestañas”, “cotización”, and
“elegible” rendered correctly in both systems.

### D2. System A — Playfair Display + Poppins

| Item | Plan |
|---|---|
| Real font weights | Playfair Display 600/700; Poppins 400/500/600/700 |
| Fallbacks | Playfair → Georgia → Times New Roman → serif; Poppins → Segoe UI → Arial → sans-serif |
| Loading | One Google Fonts CSS request with only those weights and `display=swap`; keep current preconnects |
| Preload | No. Cross-origin Google font-file URLs are subset/version specific; preload only after self-hosting and measured LCP evidence. |
| Layout shift | Playfair is wider/taller at the hero and Poppins is geometrically wide. Swap can move hero line breaks and control widths; fallback metric overrides would need measured `size-adjust`. |
| Defect avoidance | Load real Poppins 700, remove every 800/900 request, and reject the build/E2E review if `font-synthesis` is observed. |

Observed: continuity and Bella Mujer recognition are immediate. The combination also reproduces the
familiar beauty/editorial template signal identified in the audit. Poppins requires more horizontal and
vertical space in controls, selected rows, and the 200% admin specimen. It is readable, but operational
scan speed is weaker than System B.

### D3. System B — Newsreader + Source Sans 3

| Item | Plan |
|---|---|
| Real font weights | Newsreader 500/600; Source Sans 3 400/600/700 |
| Fallbacks | Newsreader → Georgia → Times New Roman → serif; Source Sans 3 → Segoe UI → Arial → sans-serif |
| Loading | One Google Fonts CSS request using Newsreader optical-size axis at 500/600 and Source Sans 3 at 400/600/700, `display=swap`; keep both preconnects |
| Preload | No for 5F3-04B. If fonts are later self-hosted and performance data justifies it, preload only Source Sans 3 regular for initial UI/body, not every weight. |
| Layout shift | Source Sans 3 is closer to common system sans metrics and uses less width; Newsreader still changes hero breaks on swap. Reserve headline measure and test fallback/loaded screenshots. |
| Defect avoidance | No requested weight lacks a file; `font-synthesis: none`; use Newsreader optical sizing and Source Sans tabular figures for data. |

Observed: Newsreader keeps editorial warmth but feels more like a working publication/atelier than a
beauty template. Source Sans 3 makes admin labels, rows, numbers, and actions more compact without
becoming generic Inter-like SaaS. Its open forms remain calm in member mode. At 390px it keeps both hero
actions on one row at 100%; at 200% it reflows without overlap or horizontal overflow and produces a
shorter total page than System A.

### D4. Representative review

The same Spanish content, values, and layout were rendered for both systems. Public copy and the studio
image come from the real home route. Admin labels/copy and the non-PII `1 sello` / `$550 MXN` values come
from current Club UI/tests. The member block is a bounded `Mi Club` progress header specimen only; it
does not add a route or Phase 6 behavior.

| System | 390px | 820px | 1440px | 390px at 200% text |
|---|---|---|---|---|
| A | `system-a-390.png` — generated evidence; reproduce with `capture-specimens.mjs`; binary intentionally excluded from Git | `system-a-820.png` — generated evidence; reproduce with `capture-specimens.mjs`; binary intentionally excluded from Git | `system-a-1440.png` — generated evidence; reproduce with `capture-specimens.mjs`; binary intentionally excluded from Git | `system-a-390-text-200.png` — generated evidence; reproduce with `capture-specimens.mjs`; binary intentionally excluded from Git |
| B | `system-b-390.png` — generated evidence; reproduce with `capture-specimens.mjs`; binary intentionally excluded from Git | `system-b-820.png` — generated evidence; reproduce with `capture-specimens.mjs`; binary intentionally excluded from Git | `system-b-1440.png` — generated evidence; reproduce with `capture-specimens.mjs`; binary intentionally excluded from Git | `system-b-390-text-200.png` — generated evidence; reproduce with `capture-specimens.mjs`; binary intentionally excluded from Git |

The capture harness asserts that each requested font is actually loaded and that document horizontal
overflow is zero. It emulates `prefers-reduced-motion: reduce`. Review observations:

- **Bella Mujer recognition:** both preserve wine/plum, real work, Tehuacán copy, and selective serif;
  B changes voice without changing brand direction.
- **Editorial warmth:** A is more familiar/elegant; B is warmer and more textural without luxury cues.
- **Operational scan speed:** B wins through narrower Source Sans 3 forms, clearer density, and shorter
  blocks. A's Poppins feels heavier and more spatially expensive.
- **Line breaks:** both are natural at 390/820/1440. B avoids an extra stacked hero-action line at 390.
- **Control fit:** both fit at 100% and 200%; B preserves more breathing room.
- **Labels at 200%:** every label wraps rather than truncates. No row, action, amount, or heading overlaps.
- **Member tone:** B's Newsreader/Source Sans pairing makes the one signature moment warm while leaving
  progress/data trustworthy and calm.
- **Loading feasibility:** B needs five real weights total versus six for A and removes the current
  Poppins synthetic-weight mismatch rather than expanding around it.

Open the reproducible [specimen](./specimen.html) with `?system=a`, `?system=b`, and optional
`&scale=200`. The comparison page loads both candidates only because it is an isolated spike artifact;
the application must load only the approved system.

## E. Recommendation

**Recommend: `Newsreader + Source Sans 3`.**

It best satisfies the locked direction because it retains a selective editorial voice while moving away
from the familiar Playfair/Poppins beauty-template pattern. Source Sans 3 gives the admin workbench faster
scanning and better fit at 200%; Newsreader gives public and member signature moments a recognizable,
craft-oriented warmth without black/gold luxury, gradients, or ornamental motion. The combination is
coherent across all three modes and requires no third family.

This is a recommendation, not activation. Human approval must confirm that the visible change in the
public hero still reads unmistakably as Bella Mujer.

## F. Exact 5F3-04B implementation plan

### F1. Smallest atomic boundary

Implement the authority and typography globally, then validate existing representative routes under it.
Do not migrate all route palettes in the same slice.

Expected files:

- create `src/styles/_bm-references.scss` — private candidate values, never emitted for route use;
- create `src/styles/_bm-semantic-tokens.scss` — reviewed public semantic custom properties;
- create `src/styles/_bm-material-theme.scss` — one Material 21 theme emission and complete BM mapping;
- create `src/styles/_bm-typography.scss` — roles, fallbacks, real weights, tabular data, synthesis guard;
- update `src/styles.scss` — compose the modules, remove Azure/blue plus the manual override block,
  retain Phase 5F3-03 focus/scroll behavior through the new focus roles;
- update `src/index.html` — load only Newsreader + Source Sans 3 at approved weights;
- add `e2e/design-foundation.spec.ts` — token authority, computed Material roles, font availability,
  control states, focus surfaces, reflow/overflow, and reduced-motion checks;
- add review-only screenshot output outside source control or in the PR evidence, according to the
  missing `Software_Workflow.md` once supplied.

No route component/template is redesigned in this atomic slice. If global typography exposes a specific
synthetic 800/900 declaration, replace only that declaration with its approved role/real weight; list
every such exception in the 04B change summary. Page-local palette migration follows in later atomic
surface slices, not by bulk search-and-replace.

### F2. Explicitly out of scope

- `Software_Workflow.md`;
- public route composition, mobile navigation, gallery curation, or broad copy changes;
- Club route/workspace redesign and generic card extraction;
- member `Mi Club` implementation, stamps, QR, promotions, or Phase 6 behavior;
- auth, backend, API, data, session, or PII changes;
- logo, official mark, or loyalty stamp generation;
- dark mode, gradients as a primitive, or decorative motion;
- replacement of Angular Material;
- mass removal of all raw colors/radii from every route.

### F3. Migration order

1. Restore/read `Software_Workflow.md` if the team expects it to govern the slice.
2. Freeze human-approved palette values and typography system in the 04B issue/brief.
3. Add private references and semantic roles with a token inventory test.
4. Emit Material system roles from the semantic map in one Sass theme module; delete the Azure/manual
   parallel authority in the same commit.
5. Add typography roles and the single approved font request; remove synthetic 800/900 requests that
   are actually reached by the representative surfaces.
6. Remap existing global focus styles to light/inverse focus roles without changing skip-link,
   route-focus, scroll margin, fixed-control exclusion, or `aria-current` behavior.
7. Exercise Material button, form field, menu/dialog, chip/status, disabled, error, hover, pressed, and
   focus states on representative existing routes.
8. Capture public home, admin work surface, and member access at 390/820/1440 plus 200% zoom/text scale.
9. Stop for human visual approval. Do not begin page-local migrations or 5F3-05 from this slice.

### F4. Validation commands

```bash
npm run build
npm test -- --watch=false
npm run test:e2e -- e2e/design-foundation.spec.ts
npm run test:e2e -- e2e/shell-navigation-accessibility.spec.ts e2e/public-contact-contrast.spec.ts
node docs/design-spikes/phase-5f3-04a/capture-specimens.mjs
node docs/design-spikes/phase-5f3-04a/validate-contrast.mjs
```

Also inspect computed styles in Chromium for the Material mappings and use an independent contrast
calculator for every pair in section C after Sass/browser composition. Test keyboard focus on light,
inverse, and brand surfaces; 200% browser zoom and text-only scaling; reduced motion; back/forward route
focus; short-height fixed controls; and font loading with cache disabled and throttled network.

### F5. Required human approvals before 04B

1. Approve **Newsreader + Source Sans 3** or explicitly reject it in favor of the single allowed fallback.
2. Approve every candidate palette/semantic role value in sections B and C.
3. Approve the public, admin, and member representative direction shown in the screenshots.
4. Confirm whether/how `Software_Workflow.md` should be restored before implementation.

## Stop gate

This spike changes documentation and review artifacts only. It does not change application source,
activate typography, commit final palette/type implementation, create an implementation PR, or begin
5F3-05/Phase 6. Work stops here pending the four approvals above.
