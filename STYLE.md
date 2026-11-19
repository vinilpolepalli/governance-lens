# Light redesign - apply now

Convert the entire app from its current dark theme to a clean light product UI. Do not change any function, data, route, disclosure, or copy. Visuals only, plus loading-state polish. Reference style language (extracted from the user's own product, verified against its live site):

## Palette (cool, near-white, monochrome-first)
- Page ground: #fafafa. Surfaces: #ffffff.
- Ink (primary text): #18181b. Muted: #71717a. Faint: #a1a1aa.
- Borders: hairline #e8e8e8; softer dividers #f1f1f0.
- NO dark backgrounds anywhere. No gradients, no glows, no colored page sections.

## Type
- Body 14px. Page titles ~26px, weight 650, letter-spacing -0.02em.
- Section labels: 11-12px, uppercase, letter-spacing ~0.08em, muted.
- Numbers in tables/stats: font-variant-numeric: tabular-nums.

## Components
- Cards/panels: white, 1px hairline border, radius 10-12px, shadow none or at most 0 1px 2px rgba(0,0,0,0.04). Consider flat sections separated by hairlines instead of nested card-in-card.
- Buttons: primary = solid ink (#18181b) white text; secondary = white with hairline border, ink text. Radius 8px. No bright gradient buttons.
- Brand accent (EDGAR navy #16324f) only for: logo mark, active nav, focus rings, key links. Restrained, small moments - not big fills.
- Semantic vote pills keep meaning but muted: FOR = green text #15803d on #f2f9f4 with #d8e9dc border; AGAINST = #b91c1c on #fdf5f4 with #f0d9d6 border; FLAG = amber #92400e on #fffbeb with #fde68a border; REVIEW = dashed gray border, muted text.
- "LIVE FROM EDGAR" and source/fetch metadata: small muted text with hairline chip, no bright badges.
- Loading states: light background, muted gray text, simple spinner. Error states: plain text + hairline box, no red splash.
- Tables: hairline row dividers, small caps muted headers, hover #fafafa. Under 640px: tables become stacked readable rows (label above value), monetary/fact values never clipped; no horizontal scroll.
- Forms/inputs: white, hairline border, radius 8px; focus ring 3px soft navy (rgba(22,50,79,0.15)) + navy border.

## Constraints
- Keep every disclosure, source link, fetch timestamp, "not extracted" marker, simulated-action label, and the footer attribution exactly as-is in meaning and presence.
- `npm run build` and `npm run typecheck` must pass. Verify the home page, a company page, compare/policy divergence, and audit page at 1280px and 390px with real screenshots (headless chrome), fix what looks broken, no clipped content.
- Do not deploy or push.
