# ATT-386 — Resource Details Page Redesign

**Status:** Design approved · ready for implementation plan
**Linear:** https://linear.app/attraccess/issue/ATT-386
**Parent:** ATT-382 (HeroUI v3 redesign review)
**PR base:** `main`

## Problem

After the HeroUI v3 redesign, `/resources/:id` stacks Usage Session, Billing, Usage History, Maintenance, People & Permissions, Groups, plus six header actions into one dense scroll. Cluttered, hard to scan, mixes end-user and admin concerns at equal weight.

## Goal

Restructure the page so:

- End-user primary actions (start/manage session, see billing impact, see own recent runs) fit one screen with no scroll-hunt.
- Admin sections move to dedicated sub-pages, lazy-loaded, reachable from a persistent tab bar.
- Navigation context is constant: a user always knows which resource they are in and which sub-page they are viewing.

## Audience priority

End user is the primary audience. Admin is secondary and only sees admin sections when they hold the corresponding permission.

## Information architecture

### Route layout

```
/resources/:id                       ResourceTabsLayout (PageHeader + HealthWarning + Tabs + Outlet)
  ├─ index                           ResourceOverviewTab           (always)
  ├─ /history                        ResourceHistoryTab            (always; filtered to own if non-admin)
  ├─ /people                         PeopleManagement              (isIntroducer || canManageResources)
  ├─ /groups                         ManageResourceGroups          (canManageResources)
  ├─ /maintenance                    existing maintenance-hub      (maintenancePermissions.canManage)
  ├─ /flows                          existing flows                (canManageResources)
  └─ /forms                          existing forms                (canManageResources)
```

Existing routes `/resources/:id/flows`, `/forms`, `/maintenance` keep working; they get nested under the new layout so the tab bar persists when entering them.

### Tab bar

Below `PageHeader` and below `ResourceHealthWarning`. Persistent across every sub-page. Perm-filtered: tabs the user cannot access are hidden.

Order and icons:

| Tab | Path segment | Icon |
|-----|--------------|------|
| Overview | (none / index) | `GaugeIcon` |
| History | `history` | `HistoryIcon` |
| People | `people` | `UsersIcon` |
| Groups | `groups` | `FolderIcon` |
| Maintenance | `maintenance` | `WrenchIcon` |
| Flows | `flows` | `WorkflowIcon` |
| Forms | `forms` | `ListChecksIcon` |

HeroUI `Tabs` with `variant="underlined"`. Active tab auto-scrolls into view. On viewports `<sm`, if rendered label width overflows, render as a `Select` dropdown picker instead of horizontal-scroll tabs.

### Header actions

PageHeader actions slot is reduced to operations on the resource. Content actions (Documentation) move into the Overview tab.

| Action | Placement | Visibility |
|--------|-----------|------------|
| QR code | header overflow `⋯` menu | `canManageResources` |
| Edit | header overflow `⋯` menu | `canManageResources` |
| Delete | header overflow `⋯` menu | `canManageResources` |
| Documentation | Overview tab card | always |
| Flows / Forms / Maintenance | tab bar | per perm |

If the user has none of the admin permissions above, the `⋯` menu is not rendered.

### Health warning

`ResourceHealthWarning` renders above the tab bar so it is visible on every sub-page, not just Overview. Stays as-is otherwise.

## Overview tab content

```
┌──────────────────────────────────────────────────────────┐
│  Session card (focal, lg:col-span-2)                     │
│                                          ┌─────────────┐ │
│  Start / manage / end session            │ Billing     │ │
│  Flow buttons, timer, notes              │ summary     │ │
│  Insufficient balance flow               │ (side info) │ │
│                                          └─────────────┘ │
├──────────────────────────────────────────────────────────┤
│  Documentation preview                                   │
│  First ~200 chars · "Open full" → DocumentationModal     │
├──────────────────────────────────────────────────────────┤
│  Recent sessions (own last 3)                            │
│  Date · Duration · Cost · Status icon       View all →   │
└──────────────────────────────────────────────────────────┘
```

### Layout breakpoints

- `≥lg`: 3-col grid. Session 2/3 width, Billing 1/3 width.
- `md`: 1-col stack. Session full width, Billing full width directly below.
- `<md`: 1-col stack, same order.

### Session card

Reuses `ResourceUsageSession`. Visual treatment changes only via the surrounding grid; the component itself does not need to change.

### Billing card

Reuses `ResourceBillingInfo` with `variant="flat"`. Side-info treatment: muted heading, slightly smaller body, no border emphasis. `onExampleAmountChange` continues to feed `insufficientBalanceDesiredAmount` into the Session card.

### Documentation preview

New component `ResourceDocsPreviewCard`:

- Fetches resource documentation (existing endpoint already used by `DocumentationModal`).
- Renders the first ~200 chars as plain text, with a fade-out gradient.
- Button "Open full" opens `DocumentationModal`.
- Empty state: shows nothing if the resource has no documentation and the user cannot manage resources. If `canManageResources`, shows an "Add documentation" CTA.

### Recent sessions card

New component `RecentSessionsCard`:

- Calls existing usage-history API, filtered to `userId = current user`, limit 3, sorted desc by start time.
- Row layout: date · duration · cost (if billed; `—` if free) · status icon (completed / interrupted / in-progress).
- Empty state: "No runs yet on this resource."
- Footer link: "View all →" navigates to `/resources/:id/history`.

## Sub-pages

### History (`/history`)

Wraps existing `ResourceUsageHistory` with no behavioral change. Backend filtering already discriminates own vs all-users by permission.

### People, Groups, Maintenance, Flows, Forms

Existing components, rendered directly into the tab outlet. No changes beyond removing the previously stacked rendering on the main page.

## Component changes

### Keep unchanged

- `ResourceUsageSession`
- `ResourceBillingInfo`
- `ResourceUsageHistory`
- `PeopleManagement`
- `ManageResourceGroups`
- `MaintenanceManagement` (sub-route content)
- `ResourceHealthWarning`
- `DocumentationModal`
- `ResourceEditModal`
- `ResourceQrCode`
- `DeleteConfirmationModal`

### New

- `ResourceTabsLayout` — page shell. Renders `PageHeader`, `ResourceHealthWarning`, `Tabs`, `<Outlet />`. Owns the QR/Edit/Delete header actions and the delete confirmation modal state.
- `ResourceOverviewTab` — composes Session + Billing grid, Documentation preview, Recent sessions.
- `RecentSessionsCard` — own last 3 sessions.
- `ResourceDocsPreviewCard` — docs preview + open-modal trigger.
- `useResourceTabs` — small hook returning the list of visible tab descriptors based on permissions. Centralizes perm checks so both the tab bar and any deep links can use the same source of truth.

### Removed from `resourceDetails.tsx`

- Inline stacking of Usage History, People, Groups, Maintenance under the same scroll.
- The flat header action set is replaced by the slimmed PageHeader action list managed by `ResourceTabsLayout`.

## Routing

Use React Router nested routes. The current `routes/index.tsx` registers each `/resources/:id/...` route separately; replace those with a parent layout route plus child routes. Existing direct links (`/flows`, `/forms`, `/maintenance`) continue resolving to the same components, only now rendered inside the layout outlet.

Deep links that currently rely on the page actions to navigate (e.g. clicking "Flows" in the header) become tab clicks. Existing deep links from other parts of the app are unaffected.

## Behavior details

- Tab state lives in the URL, not in component state. Reload preserves tab.
- When a non-admin user lands on `/resources/:id/people` directly, the tab is not visible to them; the router redirects them to `/resources/:id` (Overview). Same for any sub-route they lack permission for.
- The "View all →" link in `RecentSessionsCard` uses `navigate('history')` (relative) so it works regardless of how the page was reached.
- Loading state: while `useResourcesServiceGetOneResourceById` is loading, show a single page-level spinner (existing behavior). After loading, each tab renders its own internal loading state.
- Error state: resource-not-found page unchanged.

## Mobile

- Tabs: horizontal scroll with snap, active tab scrolls into view on tab change.
- If 5+ tabs visible and viewport `<sm`: collapse to a `Select` dropdown.
- Overview grid stacks vertically. No 2-col attempt below `md` — Session and Billing in a tablet 2-col layout is `md` and above.

## i18n

- Add new keys under `resourceDetails`:
  - `tabs.overview`, `tabs.history`, `tabs.people`, `tabs.groups`, `tabs.maintenance`, `tabs.flows`, `tabs.forms`
  - `overview.docs.preview`, `overview.docs.empty`, `overview.docs.addCta`, `overview.docs.openFull`
  - `overview.recent.title`, `overview.recent.empty`, `overview.recent.viewAll`
- German and English translations both added.

## Out of scope

- Changing the internals of any existing sub-page (Maintenance hub, Flows, Forms).
- Changing the usage-history API or table.
- Changing billing data model or example-amount flow.
- Role-aware density toggles or saved-view preferences.
- Accessibility audit beyond the existing component compliance.

## Open questions

None for this redesign. Implementation will surface micro-decisions (exact spacing, exact preview char count) that can be settled inline.

## Acceptance criteria

1. `/resources/:id` renders only the Overview tab content (Session + Billing side-by-side on `≥lg`, Documentation preview, Recent sessions). Nothing else stacked below.
2. `ResourceHealthWarning` is visible on every sub-page (`/people`, `/groups`, `/maintenance`, `/flows`, `/forms`, `/history`).
3. Tab bar is persistent across all sub-pages, only shows tabs the current user can access, and reflects the active route.
4. PageHeader actions are reduced to a single overflow `⋯` menu containing QR, Edit, and Delete (admin only). The menu is hidden entirely for users with no admin permissions.
5. Documentation preview renders a snippet of the first stored docs and opens the existing `DocumentationModal` from the "Open full" button. Empty/admin-CTA empty state behaves as specified.
6. Recent sessions card lists the logged-in user's own last 3 sessions with date, duration, cost, status icon, and a "View all →" link to the History tab.
7. Direct navigation to a sub-page the user lacks permission for redirects to Overview.
8. Mobile viewport (`<sm`): tabs collapse to a `Select` picker when more than 5 visible labels; Overview content stacks single-column.
9. All existing deep links (e.g. `/resources/:id/flows`) still resolve and render the same content inside the new layout.
10. No regressions on Cypress flows currently exercising the page header actions and sub-page navigation.
