import {
  useRbacServiceListPermissions,
  useRbacServiceListRoles,
  useUsersServiceGetUserRoleAssignments,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useMemo } from 'react';
import { PermissionChipGroups } from '../../../../components/permissionList';
import en from '../en.json';
import de from '../de.json';

interface EffectivePermissionsSectionProps {
  userId: number;
}

export function EffectivePermissionsSection({ userId }: EffectivePermissionsSectionProps) {
  const { t } = useTranslations({ en, de });
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

  const effectivePermissions = useMemo(
    () => (allPermissions ?? []).filter((permission) => effectivePermKeys.has(permission.key)),
    [allPermissions, effectivePermKeys],
  );

  if (isLoadingRoles || isLoadingPerms || isLoadingUserRoles) {
    return <p className="text-sm text-default-400">{t('effectivePermissions.loading')}</p>;
  }

  if (effectivePermKeys.size === 0) {
    return <p className="text-sm text-default-400">{t('effectivePermissions.empty')}</p>;
  }

  return (
    <PermissionChipGroups
      permissions={effectivePermissions}
      uncategorizedLabel={t('effectivePermissions.uncategorized')}
    />
  );
}
