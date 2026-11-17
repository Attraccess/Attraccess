export const CATEGORY_ORDER = ['resources', 'users', 'system', 'billing'];

interface GroupablePermission {
  category: string;
  pluginName?: string | null;
}

export interface PermissionCategoryGroup<P> {
  category: string;
  permissions: P[];
}

/** Rank of a category: core categories in their fixed order, then plugin categories, then anything else. */
function categoryRank(category: string, pluginName: string | null | undefined): number {
  const core = CATEGORY_ORDER.indexOf(category);
  if (core !== -1) return core;
  return pluginName ? CATEGORY_ORDER.length : CATEGORY_ORDER.length + 1;
}

/** Groups permissions by category: core categories first, then plugin categories sorted by plugin name. */
export function groupPermissionsByCategory<P extends GroupablePermission>(
  permissions: P[],
): PermissionCategoryGroup<P>[] {
  const groups = new Map<string, P[]>();
  for (const permission of permissions) {
    const group = groups.get(permission.category) ?? [];
    group.push(permission);
    groups.set(permission.category, group);
  }
  const pluginOf = (category: string) => groups.get(category)?.[0]?.pluginName ?? null;
  const categories = [...groups.keys()].sort((a, b) => {
    const rank = categoryRank(a, pluginOf(a)) - categoryRank(b, pluginOf(b));
    if (rank !== 0) return rank;
    return (pluginOf(a) ?? a).localeCompare(pluginOf(b) ?? b);
  });
  return categories.map((category) => ({ category, permissions: groups.get(category) as P[] }));
}
