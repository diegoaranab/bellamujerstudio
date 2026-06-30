# Public Website Plan

This document plans the customer-facing Bella Mujer Studio website. It is intentionally documentation-only: no Angular routes, components, styles, backend behavior, API behavior, authentication, deployment settings, or production data changes are implemented in this phase.

## 1. Current State

- The current Angular app is primarily focused on admin and operations workflows.
- The current root route redirects toward `/inicio`, which is the admin dashboard experience.
- `/tarjeta-regalo` is currently the only public route.
- Backend, API, authentication, database, and admin-production work are separate from this public-site planning effort.
- This phase should define the public website direction without modifying app behavior or backend behavior.

## 2. Product Intent

The public website should help customers quickly understand what Bella Mujer Studio offers, see real examples of the studio's work, trust the business, and contact or book through WhatsApp with minimal friction. It should be mobile-first, WhatsApp-first, portfolio-first, and local-search aware.

The V1 public website is not a full booking system. Its main job is to present the salon clearly, build confidence, and move interested customers into a WhatsApp conversation.

## 3. Audience

Likely visitors include:

- Mostly mobile users.
- Local customers in Tehuacán, Puebla and nearby areas.
- Beauty-service customers looking for services, examples, prices, availability, or contact information.
- People arriving from Instagram, Facebook, WhatsApp shares, Google, or other local search surfaces.

Design implication: the public website should be mobile-first, fast, clear, visually attractive, and easy to contact from any screen.

## 4. Recommended Route Architecture

Recommended future route structure:

| Route | Purpose |
| --- | --- |
| `/` | Public homepage. |
| `/servicios` | Public services page. |
| `/galeria` | Public portfolio/gallery page. |
| `/contacto` | Public contact and location page. |
| `/tarjeta-regalo` | Existing public gift-card route. |
| `/admin/inicio` | Admin dashboard. |
| `/admin/servicios` | Admin services management. |
| `/admin/clientes` | Admin client management. |
| `/admin/inventario` | Admin inventory management. |
| `/admin/tarjetas-regalo` | Admin gift-card management. |
| `/admin/asistente` | Admin assistant experience. |
| `/admin/configuracion` | Admin configuration. |

The first implementation MVP can start with a public homepage that uses anchor sections for services, gallery, contact, FAQ, and booking information. Full SEO-oriented pages such as `/servicios`, `/galeria`, and `/contacto` can be split out in a later phase when content depth and metadata are ready.

## 5. Homepage Content Architecture

Recommended homepage sections:

- Header/navigation with the Bella Mujer Studio name, section links, and a WhatsApp contact action.
- Hero with a clear service promise, local context, primary WhatsApp CTA, and strong visual proof.
- Services preview with the main service categories customers are most likely to search for.
- Gallery/portfolio preview using real work photos.
- Why Bella Mujer, focused on trust, care, experience, hygiene, style, and local credibility.
- Booking process explaining the simple WhatsApp-first flow.
- Location/contact with WhatsApp, social links, hours, and address or service area.
- FAQ with concise answers to common customer questions.
- Footer with business name, contact links, location/service area, social links, and legal/basic site links if needed.
- Sticky mobile WhatsApp CTA that remains easy to tap without blocking key content.

## 6. Design Direction

Preserve the current feminine and elegant brand direction. The public site should feel polished, warm, trustworthy, and beauty-focused while staying practical for mobile customers trying to make a quick decision.

Current brand colors to carry forward:

| Token | Color |
| --- | --- |
| Deep rose | `#8a1e3f` |
| Soft pink | `#f8d0d7` |
| Blush background | `#fff7f9` |
| Dark wine | `#4b1026` |

Current typography direction:

- Poppins for body text and interface text.
- Playfair Display for headings and editorial moments.

The recommendation is refinement, not a full rebrand. Real work photos should carry the visual identity more than heavy decoration, gradients, icons, or ornamental layouts.

## 7. Gallery Strategy

V1 should use a curated static gallery rather than depending on a live Instagram or Facebook feed. This keeps the first implementation reliable, fast, and simple to deploy through the existing static Angular/GitHub Pages setup.

Suggested asset location:

- `public/assets/gallery/`

Future gallery metadata fields:

| Field | Purpose |
| --- | --- |
| `src` | Path to the gallery image. |
| `alt` | Descriptive Spanish alt text for accessibility and SEO. |
| `category` | Service/category grouping, such as nails, lashes, brows, makeup, or hair. |
| `featured` | Whether the image should appear in the homepage preview. |

## 8. SEO And Local Search Direction

The public website should include crawlable text for:

- Bella Mujer Studio.
- Tehuacán, Puebla.
- Services.
- WhatsApp/contact.
- Hours.
- Address or service area.
- Social links.

Recommended future metadata:

- `title`.
- `meta description`.
- Open Graph title, description, and image.
- Canonical URL.
- `LocalBusiness` or `BeautySalon` JSON-LD.

Detailed SEO implementation belongs to a later implementation phase. Phase 0 only defines the direction so routing, content, metadata, and page structure can be implemented intentionally later.

## 9. Accessibility And Mobile UX Requirements

- Use a mobile-first layout.
- Make main CTA buttons large and easy to tap.
- Prevent horizontal overflow at mobile widths.
- Use semantic headings and landmarks.
- Give images descriptive alt text.
- Avoid auto-rotating carousels.
- Keep text readable and contrast strong.
- Keep the WhatsApp CTA accessible without covering important content.

## 10. MVP Non-Goals

The public website MVP should not include:

- Full booking system.
- Customer login.
- Online payment.
- Mercado Pago integration.
- Live Instagram API integration.
- Admin authentication.
- Backend data migration.
- Dynamic production database service catalog.
- Multi-tenant SaaS architecture.

## 11. Future Phase Breakdown

| Phase | Focus |
| --- | --- |
| Phase 1 | Routing and layout separation. |
| Phase 2 | Public homepage MVP. |
| Phase 3 | Gallery and visual polish. |
| Phase 4 | SEO, metadata, and local business polish. |
| Phase 5 | Public services page. |

## 12. Testing Direction

Future implementation phases should validate:

- Public routes load correctly on GitHub Pages.
- Admin routes remain separated from public routes.
- Mobile layouts work at common narrow widths.
- No horizontal overflow appears on public pages.
- WhatsApp links open with the expected destination and Spanish message.
- Images render with useful alt text.
- Metadata appears correctly in built pages when SEO work is implemented.
- Existing admin workflows are not regressed by public layout or routing changes.

## 13. Acceptance Criteria For Phase 0

- The new document exists at `docs/public-site/public-website-plan.md`.
- It is documentation-only.
- It does not modify Angular app behavior.
- It does not modify backend behavior.
- It clearly separates public website work from admin/backend work.
- It defines route, UX, content, SEO, accessibility, and testing direction.
- Markdown is readable and formatted consistently.
