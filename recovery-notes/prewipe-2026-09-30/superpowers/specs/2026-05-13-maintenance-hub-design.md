# Maintenance hub — design spec (ATT-290)

Status: design approved, ready for implementation plan.
Linear: [ATT-290](https://linear.app/attraccess/issue/ATT-290)
Date: 2026-05-13

## Problem

`apps/frontend/src/app/resources/details/resourceDetails.tsx` currently renders both `<MaintenanceManagement>` (running / upcoming / past instances) and `<MaintenanceSchedules>` (recurring trigger definitions) as full cards on the resource detail page. The Schedules card is a configuration concern — vertical real-estate cost without status value — and the review note in ATT-290 asks to move it. The user wants the configuration *and* a fuller view of maintenance moved to a dedicated route while keeping a quick "what's happening" affordance on the detail page.

## Outcome

A new route at `/resources/:id/maintenance` becomes the single place to manage all maintenance for a resource. The detail page keeps the existing `<MaintenanceManagement>` card unchanged for live status, and gains two trigger affordances pointing at the new route. The new route uses a stat-strip + tabs hub layout, with one tab for schedule definitions (accordion) and one for the activity log (grouped Live / Upcoming / History sections). Creating and editing a schedule happens in a side Drawer.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Where do schedules live | New dedicated route, not modal | User decision in ATT-290 comment thread |
| What else lives there | Both schedule definitions AND maintenance instances | User: "show them in dedicated maintenance page" |
| Detail page keeps | `<MaintenanceManagement>` as-is | User: "keep maintenances on details" |
| Layout shell | Stat strip + tabs ("B") | Hub feel; tabs separate config from status |
| Tab count | 2 — Schedules, Active & history | No Calendar tab (occurrence preview deferred) |
| Schedules tab list | Accordion | Summary row + expand for detail and inline actions |
| Active & history tab | Grouped sections: Live → Upcoming → History | Live action ("Mark done") needs prominence |
| Create / edit schedule | Right-side Drawer with blur backdrop | Form has 5+ conditional fields; list stays in view |
| Detail page trigger | Both PageHeader button AND link inside MaintenanceManagement card header | Discoverable + ergonomic |

## Route

* Path: `/resources/:id/maintenance`
* Registered in `apps/frontend/src/app/routes/index.tsx` next to the existing `flows` / `forms` / `documentation` sibling routes
* Permission gate: `maintenancePermissions?.canManage` — same hook used today by both `<MaintenanceManagement>` and `<MaintenanceSchedules>`. Unauthorized users 404 to the detail page.
* New component file: `apps/frontend/src/app/resources/details/maintenance-hub/index.tsx` (subdirectory next to the existing `maintenance-schedules/` and `maintenance-management/` directories so the three remain neighbors).

## Page anatomy

```
PageHeader  (backTo = /resources/:id, title = "Maintenance · <resource name>")
            actions = [+ New schedule]   (primary button, opens Drawer in "create" mode)

Stat strip  (4 stat tiles, full-width grid, Card variant=default each)
  ┌────────────┬────────────┬────────────┬────────────────┐
  │ Active  3  │ Schedules 7│ Next run 4h│ This month  12 │
  └────────────┴────────────┴────────────┴────────────────┘

Tabs        (HeroUI Tabs, variant=secondary / underlined, orientation=horizontal)
  ├─ Schedules        (default tab)
  └─ Active & history

Tab panel   (full-width Card wrapper)
```

### Stat tiles — values + source

| Tile | Value | Source |
|---|---|---|
| Active | count of in-progress maintenance instances | `GET /resources/:id/maintenance` filtered by `status=active` (or whatever the existing query already returns) |
| Schedules | count of enabled schedule definitions | existing `useMaintenanceSchedules` hook total |
| Next run | "in 4h" relative to now, or "—" if none | earliest non-active future occurrence — needs upcoming-instances endpoint or client-side derivation from existing data (TBD per "Open items") |
| This month | count of maintenance instances started in current calendar month | existing history query filtered client-side |

Stat tiles are read-only labels (no click target) in v1. Refine if usage warrants.

## Schedules tab

Accordion (HeroUI v3 `Accordion`, `variant=surface`, `selectionMode=single`). One item per schedule definition.

**Summary row** (always visible):

```
[▸]  Weekly clean              [Time interval · every 7d]   [on / paused]
```

* Icon prefix chooses by trigger type: USAGE_HOURS → ⏳, USAGE_COUNT → #, TIME_INTERVAL → ⏱ (Lucide icons, reuse existing icon set).
* Status chip: `Chip size=sm variant=soft color=success` for enabled, `color=warning` for paused. Use the dot pattern.

**Expanded panel** (one open at a time):

* Human-readable trigger sentence (full): "Every 7 days, blocks resource for 2h. Started 22 min ago — ends in 1h 38m." Generate from the same config-summary util `<MaintenanceSchedules>` uses today.
* Inline actions: `Edit` (opens Drawer), `Pause` / `Resume` (toggles enabled), `Delete` (opens existing `DeleteConfirmationModal`).
* No nested expand for "next run" details in v1.

**Empty state**: centered icon + "No maintenance schedules yet" + primary "New schedule" button. HeroUI `Card` with `padding=lg`, vertically centered content.

**Loading state**: 3 skeleton accordion items (HeroUI `Skeleton`).

## Active & history tab

Three vertically stacked sections inside the tab panel.

### Section 1 — Live now

* Only shown if at least one in-progress maintenance exists.
* Section label: small uppercase label "LIVE NOW · N" with a pulsing green dot.
* One status card per active maintenance:
  * Title: matching schedule name, or "Manual" for ad-hoc
  * Subtitle: "Started 22 min ago · ends in 1h 38m · by jappy"
  * Action: "Mark done" button (primary), reuses the same mutation the detail-page `<MaintenanceManagement>` calls today
  * Visual: `Card` with thin green accent border / `bg-success-50` surface to telegraph "running"
* Hidden entirely (no empty-state placeholder) when no live maintenance.

### Section 2 — Upcoming

* Section label: "UPCOMING · N"
* Compact table (HeroUI `Table`, `selectionMode=none`, no row click):
  * Columns: When (relative time), Duration, Reason / source schedule, optional actions (cancel? — out of scope v1, see Open items)
* Empty: collapsed section showing "No upcoming maintenance" muted text. Section header stays visible so users learn it exists.

### Section 3 — History

* Section label: "HISTORY · last 30 days" plus a right-aligned `Show all` button (paginates further back).
* Same compact table, columns: When, Duration, Reason, Completed by.
* Empty: "No past maintenance" muted text.

The "Include past" toggle in today's `<MaintenanceManagement>` is dropped — replaced by the always-visible History section. The detail page's `<MaintenanceManagement>` component is **not modified** as part of this design; it keeps the toggle as a quick-filter for the embedded card.

## Create / edit schedule — Drawer

HeroUI v3 `Drawer`, `placement=right`, `size=md`, `backdrop=blur`, drag handle enabled.

**Triggers**:

* "+ New schedule" button in PageHeader actions → opens drawer in create mode
* "Edit" button inside an expanded accordion item → opens drawer in edit mode with `scheduleId` prop
* "New schedule" button in the empty state → opens drawer in create mode

**Drawer structure**:

```
Drawer.Header
  Title: "New maintenance schedule" / "Edit: Weekly clean"
  Close trigger (×)
Drawer.Body  (scrollable)
  Form
    TextField   Name
    Select      Trigger type (USAGE_HOURS | USAGE_COUNT | TIME_INTERVAL)
    [conditional fields per trigger type — same as today's MaintenanceScheduleUpsertModal body]
    LabeledSwitch  Enabled
    Alert       (error display, only on validation/server error)
Drawer.Footer
  Button variant=ghost   Cancel
  Button variant=primary Save  (isPending while mutating)
```

The form internals (`TextField`, `Select`, conditional config fields, validation) are lifted from `apps/frontend/src/app/resources/details/maintenance-schedules/upsert/index.tsx` mostly unchanged — only the surrounding overlay component swaps from `Modal*` to `Drawer*`.

Delete confirmation continues to use the existing `DeleteConfirmationModal` (HeroUI `Modal size=sm`) — appropriate for a single binary decision.

## Detail page changes

Two new trigger affordances on `apps/frontend/src/app/resources/details/resourceDetails.tsx`:

1. **PageHeader actions**: add `<Button variant=tertiary leftIcon=Wrench>Maintenance</Button>` to the actions row that today carries Flows / Forms / Edit. Navigates to `/resources/:id/maintenance`. Gated by `maintenancePermissions?.canManage`.
2. **MaintenanceManagement card header**: inside the existing `<MaintenanceManagement>` card's `CardHeader`/`PageHeader`, add a small trailing link "Manage maintenance →". Same destination. Lives alongside the existing "Include Past" toggle.

The `<MaintenanceSchedules>` import and render are **removed** from `resourceDetails.tsx`. The component itself remains in the codebase because the new `/maintenance` route's Schedules tab reuses parts of it (or is rewritten — see "Component reuse" below).

## Component reuse vs new

| Existing | Status on new route |
|---|---|
| `maintenance-schedules/index.tsx` | Replaced. The accordion view differs enough from today's table that we ship a new `maintenance-hub/schedules-tab.tsx`. The old file is **removed** once the new route is live (no dual maintenance burden). |
| `maintenance-schedules/upsert/index.tsx` (modal body) | Form body **extracted** into `maintenance-hub/schedule-form.tsx`. The drawer imports it. The old modal file is removed. |
| `maintenance-management/index.tsx` (on detail page) | **Unchanged**, still rendered on detail page. New route does **not** re-use this component — it implements its own grouped Live/Upcoming/History layout. |
| `DeleteConfirmationModal` (shared) | Reused as-is for schedule delete. |
| Data hooks (`useMaintenanceSchedules`, `useMaintenanceInstances`, `useUpsertSchedule`, `useDeleteSchedule`, `useMarkMaintenanceDone`) | Reused as-is. |
| i18n keys | Add new namespace `maintenanceHub.*`; preserve existing `maintenanceSchedules.*` keys used by the form body. Migrate keys only where labels actually changed. |

Two `Active & history` rendering paths exist (the detail-page component and the new-route grouped sections). This is accepted as the cost of keeping a focused, quick-view card on the detail page while the dedicated route is richer. Both call the same data hooks, so divergence risk is only visual.

## Permissions

* Route protected by the same `maintenancePermissions?.canManage` check used by `<MaintenanceManagement>` and `<MaintenanceSchedules>`.
* If the user lacks permission, navigate back to `/resources/:id`. If the resource itself doesn't resolve, navigate to `/resources` (matches the fallback today's detail page uses).

## Out of scope (v1)

* Calendar tab / occurrence preview — deferred.
* Cancelling an upcoming maintenance from the Upcoming section — needs backend; create a follow-up issue.
* Bulk pause / delete of multiple schedules — selectionMode stays `none`.
* Resource-level "pause all schedules" master switch — defer.
* Stat tiles as filter chips (clicking Active jumps to live section) — defer.
* Drawer drag-to-dismiss gesture polish — use HeroUI default.

## Open items / TBD

* **"Next run" stat tile** depends on whether the API exposes upcoming instances or whether occurrences need client-side computation from trigger configs. If the backend doesn't return upcoming for non-time-interval triggers (e.g. USAGE_HOURS depends on real usage), the tile shows "—" for those and uses the soonest time-based occurrence otherwise. Resolve during implementation by reading the existing instances query response.
* **Section header copy** — confirm strings with the i18n owner before finalizing keys.
* **Icon choices** for trigger types — current detail-page table uses no icons; pick from Lucide set (⏳ Hourglass, # Hash, ⏱ Timer) during implementation.

## Acceptance criteria

1. New route `/resources/:id/maintenance` reachable from two places on the detail page.
2. PageHeader on the new route has a working back arrow to `/resources/:id` and a "+ New schedule" primary action.
3. Schedules tab shows all schedules as accordion items, expanding reveals trigger detail + Edit / Pause / Delete actions.
4. Create/edit Drawer slides from right, saves correctly, list updates on success.
5. Active & history tab shows live status card with "Mark done", upcoming list, and history list.
6. Detail page no longer renders `<MaintenanceSchedules>`. `<MaintenanceManagement>` still renders there unchanged.
7. Permission gate identical to today's `canManage` check.
8. Light + dark theme parity, mobile breakpoint (tabs collapse, stat strip wraps to 2×2, drawer becomes bottom sheet — HeroUI default).
9. i18n keys present for all new strings (placeholder English values OK in v1).
