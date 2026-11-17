import type { Permission } from '@attraccess/react-query-client';

export const CATEGORY_ORDER = ['resources', 'users', 'system', 'billing'];

/** Groups permissions by category, with the well-known categories first and unknown ones last. */
export function groupPermissionsByCategory(permissions: Permission[]) {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions) {
    const group = groups.get(permission.category) ?? [];
    group.push(permission);
    groups.set(permission.category, group);
  }
  const categories = [...groups.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? CATEGORY_ORDER.length : ia) - (ib === -1 ? CATEGORY_ORDER.length : ib);
  });
  return categories.map((category) => ({ category, permissions: groups.get(category) as Permission[] }));
}
