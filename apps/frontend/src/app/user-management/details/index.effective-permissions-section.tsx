import {
  useRbacServiceListPermissions,
  useRbacServiceListRoles,
  useUsersServiceGetUserRoleAssignments,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Chip, Separator } from '@heroui/react';
import { useRbacCatalogTranslations } from '../../../hooks/useRbacCatalogTranslations';
import { useMemo } from 'react';

export function EffectivePermissionsSection({
  userId,
  t,
}: {
  userId: number;
  t: ReturnType<typeof useTranslations>['t'];
}) {
  const { permissionLabel, permissionDescription, permissionCategory } = useRbacCatalogTranslations();
  const { data: allRoles, isLoading: isLoadingRoles } = useRbacServiceListRoles();
  const { data: allPermissions, isLoading: isLoadingPerms } = useRbacServiceListPermissions();
  const { data: userRoles, isLoading: isLoadingUserRoles } = useUsersServiceGetUserRoleAssignments({ id: userId });

  const effectivePermKeys = useMemo(() => {
    if (!allRoles || !userRoles) return new Set<string>();
    const assignedRoleIds = new Set(userRoles.map((ur) => ur.roleId));
    const keys = new Set<string>();
    for (const role of allRoles) {
      if (!assignedRoleIds.has(role.id)) continue;
      for (const rp of role.rolePermissions ?? []) {
        keys.add(rp.permissionKey);
      }
    }
    return keys;
  }, [allRoles, userRoles]);

  // Group effective permissions by category using the full permission list
  const permsByCategory = useMemo(() => {
    const map = new Map<string, { key: string; label: string; description: string }[]>();
    for (const perm of allPermissions ?? []) {
      if (!effectivePermKeys.has(perm.key)) continue;
      const cat = perm.category || t('effectivePermissions.uncategorized');
      const bucket = map.get(cat) ?? [];
      bucket.push(perm);
      map.set(cat, bucket);
    }
    return map;
  }, [allPermissions, effectivePermKeys, t]);

  if (isLoadingRoles || isLoadingPerms || isLoadingUserRoles) {
    return <p className="text-sm text-default-400">{t('effectivePermissions.loading')}</p>;
  }

  if (effectivePermKeys.size === 0) {
    return <p className="text-sm text-default-400">{t('effectivePermissions.empty')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {[...permsByCategory.entries()].map(([category, perms], idx, arr) => (
        <div key={category} className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-default-500">
            {permissionCategory(category)}
          </p>
          <div className="flex flex-wrap gap-1">
            {perms.map((p) => (
              <Chip key={p.key} size="sm" color="accent" variant="secondary" title={permissionDescription(p)}>
                {permissionLabel(p)}
              </Chip>
            ))}
          </div>
          {idx < arr.length - 1 ? <Separator className="mt-1" /> : null}
        </div>
      ))}
    </div>
  );
}
