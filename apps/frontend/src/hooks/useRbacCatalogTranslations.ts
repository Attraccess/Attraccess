import { useMemo } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from '../global-translations/rbac-catalog.en.json';
import de from '../global-translations/rbac-catalog.de.json';

// The core permission catalog and the system roles are seeded in English by the API.
// Translate them by their stable key here; custom roles keep the API value. Plugin
// permissions carry their own English and German texts, chosen by the current language
// with English, then the key, as fallbacks.
export interface PermissionLike {
  key: string;
  label?: string | null;
  description?: string | null;
  pluginName?: string | null;
  labelDe?: string | null;
  descriptionDe?: string | null;
  categoryLabel?: string | null;
  categoryLabelDe?: string | null;
}

interface RoleLike {
  key?: string | null;
  name?: string | null;
  description?: string | null;
}

export function useRbacCatalogTranslations() {
  const { t, tExists, language } = useTranslations({ en, de });

  return useMemo(() => {
    const tr = (key: string, fallback: string) => (tExists(key) ? t(key) : fallback);
    const localized = (english: string | null | undefined, german: string | null | undefined) =>
      (language === 'de' ? german : null) || english || null;

    return {
      permissionLabel: (permission: PermissionLike) =>
        permission.pluginName
          ? (localized(permission.label, permission.labelDe) ?? permission.key)
          : tr(`permissions.${permission.key}.label`, permission.label ?? permission.key),
      permissionDescription: (permission: PermissionLike) =>
        permission.pluginName
          ? (localized(permission.description, permission.descriptionDe) ?? '')
          : tr(`permissions.${permission.key}.description`, permission.description ?? ''),
      // Plugin categories are named by any of their permissions; core ones by key
      permissionCategory: (category: string, permission?: PermissionLike) =>
        (permission?.pluginName ? localized(permission.categoryLabel, permission.categoryLabelDe) : null) ??
        tr(`categories.${category}`, permission?.pluginName ?? category),
      // Without a key there is nothing stable to look up — use the API value as-is
      roleName: (role: RoleLike) =>
        role.key ? tr(`roles.${role.key}.name`, role.name ?? role.key) : (role.name ?? ''),
      roleDescription: (role: RoleLike) =>
        role.key ? tr(`roles.${role.key}.description`, role.description ?? '') : (role.description ?? ''),
    };
  }, [t, tExists, language]);
}
