import { useEffect, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import {
  ApiError,
  UserRole,
  useRbacServiceListRoles,
  useUsersServiceGetUserRoleAssignments,
  useUsersServiceAssignRoleToUser,
  useUsersServiceRevokeRoleFromUser,
  useUsersServiceGetUserRoleAssignmentsKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useRbacCatalogTranslations } from '../../../../../hooks/useRbacCatalogTranslations';
import en from './en.json';
import de from './de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import { NON_MANAGEABLE_ROLE_KEYS } from './index.non-manageable-role-keys';
import { UserPermissionFormProps } from './index.user-permission-form-props';

export function useUserPermissionFormState({
  user,
  ssoManagedProviders,
  ssoManagedPermissionKeys,
  providersById,
  roleIdToAssign,
}: UserPermissionFormProps) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const { roleName } = useRbacCatalogTranslations();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const isSsoManaged = (ssoManagedProviders?.length ?? 0) > 0;
  const isRoleSsoManaged = (roleKey: string) => {
    if (!isSsoManaged) return false;
    if (ssoManagedPermissionKeys === undefined) return true;
    return ssoManagedPermissionKeys.has(roleKey);
  };
  const ssoProvidersLabel = isSsoManaged ? (ssoManagedProviders ?? []).join(', ') : t('ssoManaged.providerFallback');

  const { data: allRoles, isLoading: isLoadingRoles } = useRbacServiceListRoles();
  const { data: userRoles, isLoading: isLoadingUserRoles } = useUsersServiceGetUserRoleAssignments({ id: user.id });

  const { mutateAsync: assignRole, isPending: isAssigning } = useUsersServiceAssignRoleToUser();
  const { mutateAsync: revokeRole, isPending: isRevoking } = useUsersServiceRevokeRoleFromUser();
  const isSaving = isAssigning || isRevoking;

  const manageableRoles = (allRoles ?? []).filter((r) => !NON_MANAGEABLE_ROLE_KEYS.includes(r.key));
  const manageableRoleIds = new Set(manageableRoles.map((r) => r.id));

  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (userRoles) {
      const roleIds = new Set(userRoles.map((ur) => ur.roleId));
      if (
        roleIdToAssign &&
        allRoles?.some((role) => role.id === roleIdToAssign && !NON_MANAGEABLE_ROLE_KEYS.includes(role.key))
      ) {
        roleIds.add(roleIdToAssign);
      }
      setSelectedRoleIds(roleIds);
    }
  }, [allRoles, roleIdToAssign, userRoles]);

  // SSO assignments grouped by role ID for quick lookup
  const ssoAssignmentsByRoleId = new Map<number, UserRole[]>();
  for (const ur of userRoles ?? []) {
    if (ur.source !== 'sso') continue;
    const existing = ssoAssignmentsByRoleId.get(ur.roleId) ?? [];
    existing.push(ur);
    ssoAssignmentsByRoleId.set(ur.roleId, existing);
  }

  // Roles that are SSO-assigned but NOT in the manageable list (e.g. administrator, user)
  const ssoOnlyRoles = (userRoles ?? [])
    .filter((ur) => ur.source === 'sso' && !manageableRoleIds.has(ur.roleId))
    .reduce<{ role: UserRole['role']; assignments: UserRole[] }[]>((acc, ur) => {
      const existing = acc.find((e) => e.role?.id === ur.roleId);
      if (existing) {
        existing.assignments.push(ur);
      } else {
        acc.push({ role: ur.role, assignments: [ur] });
      }
      return acc;
    }, []);

  const allManageableSsoManaged = isSsoManaged && manageableRoles.every((r) => isRoleSsoManaged(r.key));

  const handleRoleToggle = (roleId: number) => (checked: boolean) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(roleId);
      else next.delete(roleId);
      return next;
    });
  };

  const handleSave = async () => {
    if (allManageableSsoManaged) return;

    const currentRoleIds = new Set((userRoles ?? []).map((ur) => ur.roleId));

    const toAssign = [...selectedRoleIds].filter((id) => !currentRoleIds.has(id));
    const toRevoke = [...currentRoleIds].filter((id) => {
      const role = manageableRoles.find((r) => r.id === id);
      return role && !selectedRoleIds.has(id);
    });

    const results = await Promise.allSettled([
      ...toAssign.map((roleId) => assignRole({ id: user.id, requestBody: { roleId } })),
      ...toRevoke.map((roleId) => revokeRole({ id: user.id, roleId })),
    ]);

    // Always refetch so the UI reflects the true server state, even on partial failure.
    await queryClient.invalidateQueries({ queryKey: [useUsersServiceGetUserRoleAssignmentsKey] });

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      toast.apiError({
        error: (failures[0] as PromiseRejectedResult).reason as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
        fallbackKey: 'generic',
      });
    } else {
      toast.success({ title: t('messages.updated') });
    }
  };
  return {
    t,
    roleName,
    isSsoManaged,
    isRoleSsoManaged,
    ssoProvidersLabel,
    isLoadingRoles,
    isLoadingUserRoles,
    isSaving,
    manageableRoles,
    selectedRoleIds,
    ssoAssignmentsByRoleId,
    ssoOnlyRoles,
    allManageableSsoManaged,
    handleRoleToggle,
    handleSave,
    providersById,
  };
}
