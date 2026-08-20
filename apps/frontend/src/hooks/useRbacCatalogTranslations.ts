import { useMemo } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from '../global-translations/rbac-catalog.en.json';
import de from '../global-translations/rbac-catalog.de.json';

// The permission catalog and the system roles are seeded in English by the API.
// Translate them by their stable key here; anything user-created (custom roles,
// plugin permissions) has no key entry and falls back to the API value.
interface PermissionLike {
  key: string;
  label?: string | null;
  description?: string | null;
}

interface RoleLike {
  key?: string | null;
  name?: string | null;
  description?: string | null;
}

export function useRbacCatalogTranslations() {
  const { t, tExists } = useTranslations({ en, de });

  return useMemo(() => {
    const tr = (key: string, fallback: string) => (tExists(key) ? t(key) : fallback);

    return {
      permissionLabel: (permission: PermissionLike) =>
        tr(`permissions.${permission.key}.label`, permission.label ?? permission.key),
      permissionDescription: (permission: PermissionLike) =>
        tr(`permissions.${permission.key}.description`, permission.description ?? ''),
      permissionCategory: (category: string) => tr(`categories.${category}`, category),
      // Without a key there is nothing stable to look up — use the API value as-is
      roleName: (role: RoleLike) => (role.key ? tr(`roles.${role.key}.name`, role.name ?? role.key) : (role.name ?? '')),
      roleDescription: (role: RoleLike) =>
        role.key ? tr(`roles.${role.key}.description`, role.description ?? '') : (role.description ?? ''),
    };
  }, [t, tExists]);
}
