# Bella Mujer Club experience blueprint

This document describes the intended experience and visual direction. It does not define routes or implement UI.

## Design intent

**CONFIRMED direction** — Bella Mujer Club should feel:

- feminine without becoming childish;
- polished, warm, and premium but accessible;
- beauty-oriented and energetic enough to reward progress;
- simple for nontechnical users; and
- visually richer than a generic administrative CRUD interface.

The previous Club prototype's visual feel is an important reference. Production should preserve its spirit while rebuilding the experience with reusable Angular components and the Bella Mujer design language.

## Relationship to the current application

The production application already uses:

- burgundy/wine as a brand color;
- soft pink surfaces;
- Poppins for interface and body text;
- Playfair Display for headings;
- rounded cards; and
- Angular Material.

**CONFIRMED direction** — Keep that foundation. The opportunity is to improve hierarchy: many current screens feel flat because information, actions, and sections have similar visual weight. Club should help establish the next version of Bella Mujer's design language without a big-bang redesign.

### Visual references

The following prototype colors are references, not hard requirements:

| Reference | Approximate color |
|---|---|
| Wine/burgundy | `#91224A` |
| Muted dusty rose | `#A98585` |
| Warm beige/tan | `#C09579` |
| Very light blush background | `#FFFAFA` |

Their final token roles and exact values are **OPEN TECHNICAL DECISIONS** for the visual-foundation work. This blueprint does not change global tokens.

### Typography

**CONFIRMED direction**:

- Poppins for interface, body, and data;
- Playfair Display for important titles and headings; and
- no extensive script/handwritten type inside operational UI.

Script type may still support marketing or branding assets, but should not dominate controls or dense screens.

## Member experience

The conceptual information architecture is:

```text
/club
├── Acceso
├── Mi Club
├── Mis sellos
├── Mi QR
├── Promociones
├── Recomendaciones
└── FUTURE
    ├── Referidos
    └── Citas
```

These names and paths communicate product structure; exact routing is not implemented here.

### Access

**CONFIRMED experience** — The studio registers the client and sends a private link through WhatsApp. First access establishes a 6-digit PIN; later access uses the private Club mechanism and PIN. The studio can reset or regenerate access.

**DISCARDED** — SMS/Twilio verification.

**SELECTED IN PHASE 5A** — The private WhatsApp link opens the Angular hash activation route. The SPA captures its one-time invitation token in memory and immediately scrubs it from the visible URL/history before PIN entry; it never saves the token in browser storage. The member chooses and confirms a 6-digit PIN, and a safe invalid-link state says: `Este enlace ya no es válido. Solicita uno nuevo en Bella Mujer Studio.`

Later visits use the opaque access handle and PIN. Under the current GitHub Pages/API Gateway cross-site topology, the successful member session is an opaque bearer held only in memory. Refreshing, opening a new tab, or restarting the browser therefore requires PIN login again. Logout revokes the server session and clears it from memory. This intentional current-hosting tradeoff and the possible future same-site HttpOnly-cookie migration are defined in [MEMBER_ACCESS_SECURITY.md](./MEMBER_ACCESS_SECURITY.md).

### Mi Club home

**CONFIRMED direction** — Home prioritizes progress and the next useful action, not administrative data. An illustrative hierarchy is:

```text
Hola, <nombre>

3 de 4 sellos
● ● ● ○

Te falta 1 sello para tu próxima recompensa
```

The four-stamp target above is illustrative only. The exact reward threshold is **CONFIGURABLE / not finalized**.

Home can surface:

- loyalty progress and the next reward;
- an active promotion;
- a QR shortcut;
- recent activity; and
- a recommendation.

The page should avoid payment-processing detail, internal profitability, or other administrator-oriented information.

### Stamp progress

**CONFIRMED direction** — Production should support branded visual progression with:

- a Bella Mujer identity/logo-inspired stamp mark;
- obvious achieved and pending states;
- an energetic sense of progress; and
- an accessible textual equivalent so status is never visual-only.

The exact stamp artwork and interaction are design decisions for a later implementation.

### QR

**CONFIRMED** — The QR is a convenient member identification surface, not a login credential or automatic stamp action. The member experience should explain its purpose clearly and avoid exposing PII in the rendered payload.

## Administrator experience

The conceptual information architecture is:

```text
/admin/club
├── Resumen
├── Clientas
├── Visitas
├── Promociones
├── Recompensas
└── Configuración
```

Potential later areas are **FUTURE**:

```text
Referidos
Canjes
Analytics
```

### Operational principles

**CONFIRMED direction** — The admin UI prioritizes:

- fast client lookup;
- clear visit registration;
- the client's current stamp and carry position;
- transparent history and a visible reason for every movement;
- protection against accidental duplicate stamps; and
- efficient mobile and tablet use at the studio.

QR scanning should lead to client identification and a deliberate visit confirmation workflow. It must not make loyalty changes by itself.

## Reusable visual primitives to explore

The next visual-foundation PR (planned as PR #62) may explore:

```text
BM Page Header
BM Hero Card
BM Stat Card
BM Section Card
BM Action Card
BM Progress Card
BM Stamp Progress
BM Status Badge
BM Empty State
BM Primary Action
BM Secondary Action
```

These are **design-system candidates**, not confirmed component APIs or requirements. Phase 1 should test them in a mocked Club shell. Successful patterns can then improve selected Studio screens incrementally; the plan explicitly avoids a broad one-step redesign.
