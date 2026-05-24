# ATT-389 — Resource Groups Tab Redesign (Option E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the resource details "Groups" tab body with a row-based list (status dot + name + member count + `Switch` + open link) plus a toolbar (search + segmented filter + "+ New group"), making membership state and add/remove actions explicit.

**Architecture:** Replace the HeroUI `<Table>` body in `ManageResourceGroups` with a simple flex/grid list of rows. Extract a pure filter/sort helper (unit-tested), a `GroupsToolbar` component (search input + filter chips + new-group button), and a `ResourceGroupRow` component (dot, name, members, `Switch`, open link). Wire the existing `useResourcesServiceResourceGroupsAddResource` / `RemoveResource` mutations with optimistic pending state per row.

**Tech Stack:** React, TypeScript, HeroUI v3 (`Switch`, `TextField`, `InputGroup`, `Button`, `ButtonGroup`), `@attraccess/react-query-client` (generated TanStack Query hooks), `@attraccess/plugins-frontend-ui` (`useTranslations`), Vitest + `@testing-library/react`.

---

## Spec Reference

`docs/superpowers/specs/2026-05-24-att-389-resource-groups-redesign-design.md`

## File Structure

**Modify:**
- `apps/frontend/src/app/resources/groups/index.tsx` — rewrite `ManageResourceGroups`.
- `apps/frontend/src/app/resources/groups/en.json` — rename / add / remove keys.
- `apps/frontend/src/app/resources/groups/de.json` — same.

**Create:**
- `apps/frontend/src/app/resources/groups/groupsFilter.ts` — pure filter+sort.
- `apps/frontend/src/app/resources/groups/groupsFilter.test.ts` — Vitest.
- `apps/frontend/src/app/resources/groups/GroupsToolbar.tsx` — search + filter + new-group.
- `apps/frontend/src/app/resources/groups/ResourceGroupRow.tsx` — single row.

**Touch (read-only sanity check, no edit unless noted):**
- `apps/frontend/src/components/labeledSwitch.tsx` — confirms `Switch` compound API.
- `apps/frontend/src/components/emptyState.tsx` — `message` prop.
- `apps/frontend/src/components/flatSection.tsx` — `icon`, `title`, `actions`, `children`.

---

## Task 1: Update i18n files

**Files:**
- Modify: `apps/frontend/src/app/resources/groups/en.json`
- Modify: `apps/frontend/src/app/resources/groups/de.json`

- [ ] **Step 1: Rewrite `en.json`**

```json
{
  "title": "Groups",
  "subtitle": "Choose which groups this resource belongs to",
  "search": {
    "placeholder": "Search groups…"
  },
  "filter": {
    "all": "All",
    "assigned": "Assigned",
    "available": "Available"
  },
  "row": {
    "members": "{{count}} members",
    "toggleOn": "Add {{resource}} to {{group}}",
    "toggleOff": "Remove {{resource}} from {{group}}",
    "openGroup": "open"
  },
  "newGroup": "New group",
  "empty": {
    "noGroups": "No groups exist yet.",
    "noMatch": "No groups match your search."
  },
  "errors": {
    "toggleFailed": "Could not update group membership. Please try again."
  }
}
```

- [ ] **Step 2: Rewrite `de.json`**

```json
{
  "title": "Gruppen",
  "subtitle": "Wähle aus, welchen Gruppen diese Ressource angehört",
  "search": {
    "placeholder": "Gruppen suchen…"
  },
  "filter": {
    "all": "Alle",
    "assigned": "Zugewiesen",
    "available": "Verfügbar"
  },
  "row": {
    "members": "{{count}} Mitglieder",
    "toggleOn": "{{resource}} zur Gruppe {{group}} hinzufügen",
    "toggleOff": "{{resource}} aus der Gruppe {{group}} entfernen",
    "openGroup": "öffnen"
  },
  "newGroup": "Neue Gruppe",
  "empty": {
    "noGroups": "Es existieren noch keine Gruppen.",
    "noMatch": "Keine Gruppen passen zu deiner Suche."
  },
  "errors": {
    "toggleFailed": "Gruppenzugehörigkeit konnte nicht aktualisiert werden. Bitte erneut versuchen."
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/resources/groups/en.json apps/frontend/src/app/resources/groups/de.json
git commit -m "i18n(ATT-389): refresh resource groups tab strings for Option E"
```

---

## Task 2: Pure filter+sort helper

**Files:**
- Create: `apps/frontend/src/app/resources/groups/groupsFilter.ts`
- Test: `apps/frontend/src/app/resources/groups/groupsFilter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/frontend/src/app/resources/groups/groupsFilter.test.ts
import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { filterAndSortGroups, GroupFilter } from './groupsFilter';

type G = { id: number; name: string };

const groups: G[] = [
  { id: 1, name: 'Bravo' },
  { id: 2, name: 'alpha' },
  { id: 3, name: 'Charlie' },
  { id: 4, name: 'delta' },
];
const assigned = new Set([2, 3]);

describe('filterAndSortGroups', () => {
  it('returns assigned-first, alphabetical within each bucket for filter=all', () => {
    const out = filterAndSortGroups({ groups, assignedIds: assigned, search: '', filter: 'all' });
    expect(out.map((g) => g.id)).toEqual([2, 3, 1, 4]);
  });

  it('returns only assigned, alphabetical for filter=assigned', () => {
    const out = filterAndSortGroups({ groups, assignedIds: assigned, search: '', filter: 'assigned' });
    expect(out.map((g) => g.id)).toEqual([2, 3]);
  });

  it('returns only available, alphabetical for filter=available', () => {
    const out = filterAndSortGroups({ groups, assignedIds: assigned, search: '', filter: 'available' });
    expect(out.map((g) => g.id)).toEqual([1, 4]);
  });

  it('filters by case-insensitive substring search', () => {
    const out = filterAndSortGroups({ groups, assignedIds: assigned, search: 'ph', filter: 'all' });
    expect(out.map((g) => g.id)).toEqual([2]);
  });

  it('applies search then filter (search wins narrowing)', () => {
    const out = filterAndSortGroups({ groups, assignedIds: assigned, search: 'a', filter: 'available' });
    expect(out.map((g) => g.id)).toEqual([1, 4]);
  });

  const allFilters: GroupFilter[] = ['all', 'assigned', 'available'];
  it.each(allFilters)('returns [] when search matches nothing (filter=%s)', (filter) => {
    const out = filterAndSortGroups({ groups, assignedIds: assigned, search: 'zzz', filter });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter frontend test groupsFilter --run`
Expected: FAIL with "Cannot find module './groupsFilter'".

- [ ] **Step 3: Implement helper**

```ts
// apps/frontend/src/app/resources/groups/groupsFilter.ts
export type GroupFilter = 'all' | 'assigned' | 'available';

export interface FilterAndSortGroupsArgs<G extends { id: number; name: string }> {
  groups: readonly G[];
  assignedIds: ReadonlySet<number>;
  search: string;
  filter: GroupFilter;
}

export function filterAndSortGroups<G extends { id: number; name: string }>({
  groups,
  assignedIds,
  search,
  filter,
}: FilterAndSortGroupsArgs<G>): G[] {
  const needle = search.trim().toLowerCase();
  const matchSearch = (g: G) => needle === '' || g.name.toLowerCase().includes(needle);

  const matchFilter = (g: G) => {
    if (filter === 'assigned') return assignedIds.has(g.id);
    if (filter === 'available') return !assignedIds.has(g.id);
    return true;
  };

  const visible = groups.filter((g) => matchSearch(g) && matchFilter(g));

  return visible.sort((a, b) => {
    if (filter === 'all') {
      const aA = assignedIds.has(a.id);
      const bA = assignedIds.has(b.id);
      if (aA !== bA) return aA ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter frontend test groupsFilter --run`
Expected: PASS (7 tests — 4 specific + 3 parameterized).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/resources/groups/groupsFilter.ts apps/frontend/src/app/resources/groups/groupsFilter.test.ts
git commit -m "feat(ATT-389): add pure filter+sort helper for resource groups tab"
```

---

## Task 3: `ResourceGroupRow` component

**Files:**
- Create: `apps/frontend/src/app/resources/groups/ResourceGroupRow.tsx`

- [ ] **Step 1: Implement component**

```tsx
// apps/frontend/src/app/resources/groups/ResourceGroupRow.tsx
import { Link } from '@heroui/react';
import { ChevronRightIcon } from 'lucide-react';
import { LabeledSwitch } from '../../../components/labeledSwitch';

export interface ResourceGroupRowProps {
  groupId: number;
  groupName: string;
  memberCount: number;
  membersLabel: string;
  isAssigned: boolean;
  isPending: boolean;
  toggleLabel: string;
  openLabel: string;
  openHref: string;
  onToggle: () => void;
}

export function ResourceGroupRow({
  groupId,
  groupName,
  memberCount: _memberCount,
  membersLabel,
  isAssigned,
  isPending,
  toggleLabel,
  openLabel,
  openHref,
  onToggle,
}: Readonly<ResourceGroupRowProps>) {
  const dotClass = isAssigned ? 'bg-success' : 'bg-default-200';
  const ringClass = isAssigned ? 'ring-success/40' : 'ring-default-200/40';

  return (
    <li
      data-cy={`resource-group-row-${groupId}`}
      data-assigned={isAssigned ? 'true' : 'false'}
      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-content2/40 hover:bg-content2"
    >
      <span aria-hidden className={`inline-block w-2.5 h-2.5 rounded-full ring-2 ${dotClass} ${ringClass}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate" title={groupName}>{groupName}</p>
        <p className="text-xs text-default-500">{membersLabel}</p>
      </div>
      <LabeledSwitch
        size="sm"
        isSelected={isAssigned}
        isDisabled={isPending}
        onValueChange={onToggle}
        aria-label={toggleLabel}
        data-cy={`resource-group-row-${groupId}-switch`}
      />
      <Link
        href={openHref}
        className="text-xs"
        data-cy={`resource-group-row-${groupId}-open`}
        aria-label={`${openLabel}: ${groupName}`}
      >
        {openLabel}
        <ChevronRightIcon size={14} />
      </Link>
    </li>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS (no errors in the new file).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/resources/groups/ResourceGroupRow.tsx
git commit -m "feat(ATT-389): add ResourceGroupRow with dot, switch and open link"
```

---

## Task 4: `GroupsToolbar` component

**Files:**
- Create: `apps/frontend/src/app/resources/groups/GroupsToolbar.tsx`

- [ ] **Step 1: Implement component**

```tsx
// apps/frontend/src/app/resources/groups/GroupsToolbar.tsx
import { Button, ButtonGroup, InputGroup, TextField } from '@heroui/react';
import { PlusIcon, SearchIcon } from 'lucide-react';
import type { GroupFilter } from './groupsFilter';

export interface GroupsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filter: GroupFilter;
  onFilterChange: (value: GroupFilter) => void;
  filterLabels: { all: string; assigned: string; available: string };
  assignedCount: number;
  availableCount: number;
  newGroupLabel: string;
  onNewGroup: () => void;
}

interface ChipDef {
  value: GroupFilter;
  label: string;
  badge?: number;
}

export function GroupsToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filter,
  onFilterChange,
  filterLabels,
  assignedCount,
  availableCount,
  newGroupLabel,
  onNewGroup,
}: Readonly<GroupsToolbarProps>) {
  const chips: ChipDef[] = [
    { value: 'all', label: filterLabels.all },
    { value: 'assigned', label: filterLabels.assigned, badge: assignedCount },
    { value: 'available', label: filterLabels.available, badge: availableCount },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 flex-1 min-w-0">
        <TextField
          value={search}
          onChange={onSearchChange}
          className="sm:max-w-xs w-full"
        >
          <InputGroup>
            <InputGroup.Prefix>
              <SearchIcon size={16} />
            </InputGroup.Prefix>
            <InputGroup.Input
              placeholder={searchPlaceholder}
              data-cy="resource-groups-search-input"
            />
          </InputGroup>
        </TextField>
        <ButtonGroup size="sm" data-cy="resource-groups-filter">
          {chips.map((c) => (
            <Button
              key={c.value}
              variant={filter === c.value ? 'primary' : 'flat'}
              onPress={() => onFilterChange(c.value)}
              data-cy={`resource-groups-filter-${c.value}`}
              aria-pressed={filter === c.value}
            >
              {c.label}
              {typeof c.badge === 'number' ? ` · ${c.badge}` : ''}
            </Button>
          ))}
        </ButtonGroup>
      </div>
      <Button
        variant="flat"
        size="sm"
        onPress={onNewGroup}
        data-cy="resource-groups-new-group-button"
      >
        <PlusIcon size={16} />
        {newGroupLabel}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/resources/groups/GroupsToolbar.tsx
git commit -m "feat(ATT-389): add GroupsToolbar with search, filter chips, new-group button"
```

---

## Task 5: Rewrite `ManageResourceGroups`

**Files:**
- Modify: `apps/frontend/src/app/resources/groups/index.tsx` (full rewrite of body, keep export name and prop signature)

- [ ] **Step 1: Replace file contents**

```tsx
// apps/frontend/src/app/resources/groups/index.tsx
import { HTMLAttributes, useCallback, useMemo, useState } from 'react';
import {
  ResourceGroup,
  useResourcesServiceGetAllResourcesKey,
  useResourcesServiceGetOneResourceById,
  UseResourcesServiceGetOneResourceByIdKeyFn,
  useResourcesServiceResourceGroupsAddResource,
  useResourcesServiceResourceGroupsGetMany,
  useResourcesServiceResourceGroupsRemoveResource,
} from '@attraccess/react-query-client';
import { addToast } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { GroupIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import en from './en.json';
import de from './de.json';
import { EmptyState } from '../../../components/emptyState';
import { FlatSection } from '../../../components/flatSection';
import { ResourceGroupUpsertModal } from '../../resource-groups/upsertModal/resourceGroupUpsertModal';
import { GroupsToolbar } from './GroupsToolbar';
import { ResourceGroupRow } from './ResourceGroupRow';
import { filterAndSortGroups, GroupFilter } from './groupsFilter';

type ManageResourceGroupsProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  resourceId: number;
  hideHeader?: boolean;
};

export function ManageResourceGroups({
  resourceId,
  hideHeader,
  ...rest
}: Readonly<ManageResourceGroupsProps>) {
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();

  const { data: resource } = useResourcesServiceGetOneResourceById({ id: resourceId });
  const { data: groups } = useResourcesServiceResourceGroupsGetMany();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GroupFilter>('all');
  const [pendingGroupIds, setPendingGroupIds] = useState<ReadonlySet<number>>(new Set());

  const assignedIds = useMemo<ReadonlySet<number>>(
    () => new Set(resource?.groups?.map((g) => g.id) ?? []),
    [resource?.groups],
  );

  const allGroups = groups ?? [];

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });
    queryClient.invalidateQueries({ queryKey: UseResourcesServiceGetOneResourceByIdKeyFn({ id: resourceId }) });
  }, [queryClient, resourceId]);

  const markPending = useCallback((groupId: number, on: boolean) => {
    setPendingGroupIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  }, []);

  const { mutateAsync: addResourceToGroup } = useResourcesServiceResourceGroupsAddResource();
  const { mutateAsync: removeResourceFromGroup } = useResourcesServiceResourceGroupsRemoveResource();

  const handleToggle = useCallback(
    async (group: ResourceGroup) => {
      const wasAssigned = assignedIds.has(group.id);
      markPending(group.id, true);
      try {
        if (wasAssigned) {
          await removeResourceFromGroup({ groupId: group.id, resourceId });
        } else {
          await addResourceToGroup({ groupId: group.id, resourceId });
        }
        invalidateAll();
      } catch {
        addToast({ title: t('errors.toggleFailed'), color: 'danger' });
      } finally {
        markPending(group.id, false);
      }
    },
    [addResourceToGroup, removeResourceFromGroup, assignedIds, invalidateAll, markPending, resourceId, t],
  );

  const onGroupCreated = useCallback(
    (group: ResourceGroup) => {
      handleToggle(group);
    },
    [handleToggle],
  );

  const visibleGroups = useMemo(
    () => filterAndSortGroups({ groups: allGroups, assignedIds, search, filter }),
    [allGroups, assignedIds, search, filter],
  );

  const counts = useMemo(() => {
    let assigned = 0;
    for (const g of allGroups) if (assignedIds.has(g.id)) assigned += 1;
    return { assigned, available: allGroups.length - assigned };
  }, [allGroups, assignedIds]);

  const resourceName = resource?.name ?? '';

  const renderBody = () => {
    if (allGroups.length === 0) {
      return <EmptyState message={t('empty.noGroups')} />;
    }
    if (visibleGroups.length === 0) {
      return <EmptyState message={t('empty.noMatch')} />;
    }
    return (
      <ul className="flex flex-col gap-1" data-cy="resource-groups-list">
        {visibleGroups.map((group) => {
          const isAssigned = assignedIds.has(group.id);
          return (
            <ResourceGroupRow
              key={group.id}
              groupId={group.id}
              groupName={group.name}
              memberCount={group.resourceCount ?? 0}
              membersLabel={t('row.members', { count: group.resourceCount ?? 0 })}
              isAssigned={isAssigned}
              isPending={pendingGroupIds.has(group.id)}
              toggleLabel={t(isAssigned ? 'row.toggleOff' : 'row.toggleOn', {
                resource: resourceName,
                group: group.name,
              })}
              openLabel={t('row.openGroup')}
              openHref={`/resource-groups/${group.id}`}
              onToggle={() => handleToggle(group)}
            />
          );
        })}
      </ul>
    );
  };

  const renderToolbar = (onNewGroup: () => void) => (
    <GroupsToolbar
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('search.placeholder')}
      filter={filter}
      onFilterChange={setFilter}
      filterLabels={{
        all: t('filter.all'),
        assigned: t('filter.assigned'),
        available: t('filter.available'),
      }}
      assignedCount={counts.assigned}
      availableCount={counts.available}
      newGroupLabel={t('newGroup')}
      onNewGroup={onNewGroup}
    />
  );

  const content = (
    <ResourceGroupUpsertModal onUpserted={onGroupCreated}>
      {(onOpen: () => void) => (
        <>
          {renderToolbar(onOpen)}
          {renderBody()}
        </>
      )}
    </ResourceGroupUpsertModal>
  );

  if (hideHeader) {
    return <section {...rest}>{content}</section>;
  }

  return (
    <FlatSection icon={<GroupIcon className="w-4 h-4" />} title={t('title')} {...rest}>
      {content}
    </FlatSection>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS.

If `resourceCount` is not a property on `ResourceGroup`, replace `group.resourceCount ?? 0` with `(group as unknown as { resourceCount?: number }).resourceCount ?? 0` *and* file a follow-up task; do not block on this. Check `libs/react-query-client/src/lib/models/ResourceGroup.ts` to confirm. If a different field name (e.g. `memberCount`, `resourcesCount`) exists, use that field instead.

- [ ] **Step 3: Lint**

Run: `pnpm --filter frontend exec eslint apps/frontend/src/app/resources/groups`
Expected: PASS.

- [ ] **Step 4: Run the helper test again**

Run: `pnpm --filter frontend test groupsFilter --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/app/resources/groups/index.tsx
git commit -m "feat(ATT-389): rewrite ManageResourceGroups with toolbar + Switch rows"
```

---

## Task 6: Manual browser verification

**Files:** none modified in this task.

- [ ] **Step 1: Verify `ResourceGroup` member count field name**

Run: `grep -n 'resourceCount\|memberCount\|resourcesCount' libs/react-query-client/src/lib/models/ResourceGroup.ts || true`
If empty, also check: `grep -RIn 'class ResourceGroup' libs/react-query-client/src/`

If no member-count field exists on the model, remove `memberCount` from `ResourceGroupRow` props and the membersLabel paragraph from the row, and delete the `row.members` key from both i18n files. Commit as a separate small fix:

```bash
git add -A
git commit -m "fix(ATT-389): drop member-count from row — field not in API model"
```

- [ ] **Step 2: Start the dev server**

Run (background): `pnpm --filter frontend dev`
Expected: server up on the documented port (see `apps/frontend/vite.config.ts`).

- [ ] **Step 3: Open the app in `claude-in-chrome`**

Navigate to `http://localhost:<port>/resources/<seed-id>/groups`.

- [ ] **Step 4: Screenshot matrix**

Capture and save into `/Users/jappy/.cyrus/ATT-389/attachments/`:
- `verify_01_default.png` — default filter `All`, no search.
- `verify_02_assigned.png` — filter `Assigned`.
- `verify_03_available.png` — filter `Available`.
- `verify_04_search.png` — search "test".
- `verify_05_toggle_pending.png` — mid-toggle (pending Switch).
- `verify_06_empty_nomatch.png` — search with zero results.
- `verify_07_dark.png` — dark theme (toggle theme via app settings).

For each, walk through: tab order via keyboard, dot color contrast, Switch animation works, toggle triggers add/remove in DevTools Network.

- [ ] **Step 5: Post screenshots to Linear ATT-389**

Use `mcp__linear__prepare_attachment_upload` + curl PUT + `mcp__linear__create_attachment_from_upload` per file, then post one comment summarizing.

- [ ] **Step 6: Push branch + open PR**

```bash
git push -u origin att-389-redesign-of-resource-groups-list-made-it-useless
gh pr create --title "feat(ATT-389): redesign resource groups tab (Option E)" --body "$(cat <<'EOF'
## Summary
- Replaces the resource-details Groups tab `<Table>` (whose `<Switch>` and colored border were not rendering in the live build after the HeroUI v3 migration) with a row-based list.
- Each row: status dot · group name + member count · `<Switch>` toggle · open link.
- Toolbar: search input, segmented filter (`All` / `Assigned · n` / `Available · n`), secondary `+ New group` button.
- Optimistic per-row pending state; toast on error.
- Spec: `docs/superpowers/specs/2026-05-24-att-389-resource-groups-redesign-design.md`

## Test plan
- [ ] Unit: `pnpm --filter frontend test groupsFilter --run` (7 tests pass)
- [ ] Type-check: `pnpm --filter frontend exec tsc --noEmit`
- [ ] Lint: `pnpm --filter frontend exec eslint apps/frontend/src/app/resources/groups`
- [ ] Browser: filter chips, search, switch toggle, empty-no-match, dark theme — see screenshots on Linear ATT-389
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** Toolbar (T4), row + Switch + dot + open (T3), filter+sort (T2), i18n (T1), wire-up + optimistic + toast (T5), verify (T6). All spec sections covered.
- **Placeholders:** None — every step has the actual code or command.
- **Type consistency:** `GroupFilter` defined in T2 and reused in T4/T5. `ResourceGroupRow` props match the call site in T5. `LabeledSwitch` API confirmed against `apps/frontend/src/components/labeledSwitch.tsx`.
- **Risk:** `ResourceGroup.resourceCount` field name guessed. T6/Step 1 verifies and falls back cleanly.
