# ATT-359 follow-up: UI/UX fixes after Card unwrap

Date: 2026-05-23
Linear: ATT-359
Source PR: #981 (merged) — Card components unwrapped from Account, Resource detail, Settings.

## Context

Removing the v3 Card wrappers exposed pre-existing UX debt: weak section hierarchy, inconsistent action affordances, unbalanced layouts. This spec captures fixes grouped into four independent phases. Each phase ships as its own PR.

Color critique skipped per user direction.

## User decisions

- **Multi-save buttons retained.** Per-field save UX stays on Account page.
- **Empty-state smiley retained.** Compress padding only; keep MehIcon illustration.
- **Action strip on Resource detail → Button row (Option B).** Restyle as button group; no behavior change (each still navigates). Delete moves to overflow `⋯` menu.
- **Rate-limit help text → info tooltip on label.** Compresses card vertically.

## P1 — Account page (`apps/frontend/src/app/account/index.tsx`)

- Widen page container max-width to match Settings page.
- Strengthen section headers (uppercase label + thin top border or larger font weight).
- `Generate strong password` → real Button variant, not chip.
- Danger Zone `Delete account` → stronger destructive style (bordered red).
- `Two-factor authentication` heading → uppercase to match peers.

## P2 — Settings + System cards (`apps/frontend/src/app/settings/`)

- Balance Application + Email column heights (pack denser or allow stack on narrower viewports).
- All section headers get an icon (Application, Email currently lack).
- Group `Use TLS` toggle with related fields.
- Auth Rate Limiting numeric fields → horizontal row (max attempts / window / lockout).
- Drop NumberField steppers on seconds fields → plain numeric input.
- Per-field help text → `i` tooltip on label.
- Password Policy card → summary line of current policy values + Edit button.

## P3 — Resource detail (`apps/frontend/src/app/resources/details/resourceDetails.tsx`)

- Action strip → button row (option B), no tab-strip styling.
- Delete action → overflow `⋯` menu, removes accident risk next to Edit.
- Empty states: compress vertical padding, keep MehIcon.
- Pencil-edit affordance consistent across panels (Billing already uses it).
- Highlight `Resulting balance` row (bold + larger).
- Label `Include past` / `+` / external-link icons in Maintenance side panel.
- Resource type icon: resize larger or drop entirely.
- `Add person` and `Add Group` use same affordance (both dropdown or both modal trigger).
- Hide Groups table header row when zero entries.

## P4 — Cross-cutting design tokens

- Unify button radius scale.
- Shared `<EmptyState>` component refinement (compressed default).
- Shared `<SectionHeader>` component (icon optional, uppercase label, top divider).
- aria-label audit on all icon-only buttons (eye reveal, pencil, external link).
- Unified grid system across Account, Settings, Resource detail.

## Out of scope

- Color collision fixes (user accepted current palette).
- New features.
- Backend changes.

## Verification

Each phase PR includes:
- `pnpm -r typecheck && pnpm -r lint`
- Real-browser screenshot before/after of every changed screen
- Screenshot comment on the Linear issue
