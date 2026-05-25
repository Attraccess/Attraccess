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

  return [...visible].sort((a, b) => {
    if (filter === 'all') {
      const aA = assignedIds.has(a.id);
      const bA = assignedIds.has(b.id);
      if (aA !== bA) return aA ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
