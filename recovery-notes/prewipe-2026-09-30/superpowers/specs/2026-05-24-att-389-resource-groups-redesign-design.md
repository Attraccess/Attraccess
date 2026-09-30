# ATT-389 — Resource Groups Tab Redesign (Option E)

## Context

Linear issue: [ATT-389](https://linear.app/attraccess/issue/ATT-389/redesign-of-resource-groups-list-made-it-useless)

The "Groups" tab on the resource details page currently lists every group in
the system. The signifier of membership (a colored left border and a small
HeroUI `Checkbox` in the actions column) is not visible in the live build —
either HeroUI v3 `TableRow` is dropping the `className`, or the `Checkbox`
collapses inside a flex `TableCell`. Either way the user has no usable cue for
"is this resource in this group" and the "+ Add Group" button actually creates
a brand-new group, contrary to its label.

Current implementation: `apps/frontend/src/app/resources/groups/index.tsx`.

## Goals

1. Make membership state instantly readable for every row.
2. Make assign / unassign a one-tap action with an unambiguous affordance.
3. Make it trivial to answer "which groups is this resource in?" without
   visually parsing all groups in the system.
4. Keep "create a brand-new group" as a distinct, secondary action.
5. Stay accessible: state must be conveyed by more than color alone, and the
   primary affordance must be a real form control reachable via keyboard.

## Non-Goals

- No changes to the resource-group data model or backend endpoints.
- No bulk-edit (select-many → add/remove). Single-row toggling only.
- No change to the standalone Resource Groups index page or to the group
  detail page.

## Chosen Design — Option E ("Toggle + Filter Chips")

Single list of all groups in the system. Each row has:

- A status dot on the left (filled = assigned, hollow = available) as a
  redundant non-color cue.
- The group name (truncated with a tooltip when long).
- Member count as muted subtitle.
- A HeroUI `Switch` on the right whose `on` state means "this resource is in
  this group". Toggling the switch immediately calls the add or remove
  mutation (optimistic update, rollback on error).
- A right-aligned chevron / link to open the group detail page.

Above the list:

- A search input (filters by group name, case-insensitive, client-side).
- A segmented filter: `All` / `Assigned (n)` / `Available (n)`. Default = `All`.
- A small secondary `+ New group` button (top-right) that opens the existing
  `ResourceGroupUpsertModal` and, on create, auto-assigns the new group to the
  resource (preserving today's `onGroupCreated → handleGroupClick` behavior).

Empty / edge states:

- No groups in system → render existing `<EmptyState />` with a `+ New group`
  CTA inside it.
- Filter yields zero results → small inline empty message ("No groups match
  your search").

Sort order within the list:

- Default and `All` filter: assigned groups first (alphabetical), then
  available (alphabetical). Matches today's sort.
- `Assigned` and `Available` filters: alphabetical.

Pagination:

- Drop the current `perPage = 10` slice. Render the full list with virtual
  scrolling deferred — typical instances have well under 100 groups, and the
  filter+search cover the discoverability case.

## Visual Sketch

```
┌─────────────────────────────────────────────────────────────────┐
│ Groups                                            [+ New group] │
│                                                                 │
│ 🔍 Search groups...                                             │
│ [ All ]  [ Assigned · 3 ]  [ Available · 9 ]                    │
├─────────────────────────────────────────────────────────────────┤
│ ●  Test                          12 members         [ ●——]  ›   │
│ ●  und noch eine                  5 members         [ ●——]  ›   │
│ ●  weil das testen wir hier      30 members         [ ●——]  ›   │
│ ○  Noch eine Gruppe mit lang...   8 members         [——● ]  ›   │
│ ○  Spare Gruppe                   0 members         [——● ]  ›   │
└─────────────────────────────────────────────────────────────────┘
```

Filled `●` = assigned (success color). Hollow `○` = available (muted color).
Switch is the actual action; dot is the redundant cue.

## Component Plan

Replace the current `ManageResourceGroups` body in
`apps/frontend/src/app/resources/groups/index.tsx`:

- Drop the HeroUI `Table` for this view. Use a card-style list of rows; the
  table semantics are not pulling weight here and `TableRow` / `TableCell`
  flex behavior is the root of the missing-checkbox bug.
- New row component: `ResourceGroupRow` (private to this file unless reused).
  Props: `group`, `isAssigned`, `onToggle`, `isPending`.
- New header component: `GroupsToolbar` (private). Owns search input, filter
  segmented control, and `+ New group` button.

State (kept in `ManageResourceGroups`):

- `search: string` (controlled input).
- `filter: 'all' | 'assigned' | 'available'` (default `'all'`).
- Derive `visibleGroups` from `groupsWithResource` + `search` + `filter`.

Mutation behavior:

- Optimistic update: flip local "pending" state on toggle, fire mutation, on
  error revert and toast.
- Concurrent toggles on the same row are disabled while `isPending`.
- Keep the existing query invalidation on success.

Accessibility:

- Status dot is decorative; status is announced via the `Switch`'s
  `aria-label` ("Assign Eins Test to group Test" / "Remove Eins Test from
  group Test", with locale text).
- Filter segmented control uses a native `<fieldset>` + radio inputs or
  HeroUI's `Tabs` with `role="radiogroup"`-equivalent semantics.

## i18n

Add keys to `apps/frontend/src/app/resources/groups/{en,de}.json`:

- `subtitle` → updated to "Choose which groups this resource belongs to".
- `search.placeholder` → "Search groups…" / "Gruppen suchen…".
- `filter.all`, `filter.assigned`, `filter.available`.
- `row.members` (interpolated count).
- `row.toggleOn`, `row.toggleOff` (aria-labels with `{groupName}` and
  `{resourceName}` interpolation).
- `row.openGroup` (keeps current "open" / "öffnen").
- `newGroup` (replaces today's `addGroup`).
- `empty.noGroups`, `empty.noMatch`.

Drop unused keys: `columns.*`, `table.ariaLabel`, `addGroup` (renamed).

## Out of Scope

- Bulk operations.
- Server-side search / pagination (not needed at current scale).
- Group color/icon support.

## Open Questions

None blocking. Defaults above can be tweaked during review of the PR.

## Verification

- Real-browser screenshot of the new tab in light + dark theme, with 0, 1,
  3, and 12 groups; in each of the three filter states; in pending state on a
  toggle; and in error rollback state.
- Keyboard pass: tab through search → filter → toggles → new-group button.
- Linear comment with screenshots before requesting review.
