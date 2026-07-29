import React, { useEffect, useState } from 'react';
import { Button } from '../../../../../components/button';
import { LabeledSwitch } from '../../../../../components/labeledSwitch';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import {
  ApiError,
  SSOProvider,
  User,
  UserRole,
  useRbacServiceListRoles,
  useUsersServiceGetUserRoleAssignments,
  useUsersServiceAssignRoleToUser,
  useUsersServiceRevokeRoleFromUser,
  useUsersServiceGetUserRoleAssignmentsKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { Chip, Separator } from '@heroui/react';

import en from './en.json';
import de from './de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';

// 'user' is auto-assigned to all users; 'owner' is the initial system owner — neither should be toggled manually
const NON_MANAGEABLE_ROLE_KEYS = ['user', 'owner'];

interface UserPermissionFormProps {
  user: User;
  ssoManagedProviders?: string[];
  ssoManagedPermissionKeys?: Set<string>;
  providersById?: Map<number, SSOProvider>;
}

function SsoAssignmentBadges({
  assignments,
  providersById,
  t,
}: {
  assignments: UserRole[];
  providersById?: Map<number, SSOProvider>;
  t: ReturnType<typeof useTranslations>['t'];
}) {
  if (assignments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1 ml-1">
      {assignments.map((ur) => {
        const providerName = ur.ssoProviderId ? (providersById?.get(ur.ssoProviderId)?.name ?? `#${ur.ssoProviderId}`) : ur.ssoProviderType ?? 'SSO';
        const label = ur.externalValue
          ? `${providerName} · ${ur.externalValue}`
          : providerName;
        return (
          <Chip key={`${ur.ssoProviderId}-${ur.externalValue}`} size="sm" color="warning" variant="soft">
            {t('ssoAssignment.assignedBy')}: {label}
          </Chip>
        );
      })}
    </div>
  );
}

export const UserPermissionForm: React.FC<UserPermissionFormProps> = ({
  user,
  ssoManagedProviders,
  ssoManagedPermissionKeys,
  providersById,
}) => {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const isSsoManaged = (ssoManagedProviders?.length ?? 0) > 0;
  const isRoleSsoManaged = (roleKey: string) => {
    if (!isSsoManaged) return false;
    if (ssoManagedPermissionKeys === undefined) return true;
    return ssoManagedPermissionKeys.has(roleKey);
  };
  const ssoProvidersLabel = isSsoManaged
    ? (ssoManagedProviders ?? []).join(', ')
    : t('ssoManaged.providerFallback');

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
      setSelectedRoleIds(new Set(userRoles.map((ur) => ur.roleId)));
    }
  }, [userRoles]);

  // SSO assignments grouped by role ID for quick lookup
  const ssoAssignmentsByRoleId = new Map<number, UserRole[]>();
  for (const ur of userRoles ?? []) {
    if (ur.source !== 'sso') continue;
    const existing = ssoAssignmentsByRoleId.get(ur.roleId) ?? [];
    existing.push(ur);
    ssoAssignmentsByRoleId.set(ur.roleId, existing);
  }

  // Roles that are SSO-assigned but NOT in the manageable list (e.g. owner, user)
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

  if (isLoadingRoles || isLoadingUserRoles) {
    return (
      <div className="flex justify-center p-4" data-cy="user-permission-form-loading">
        Loading permissions...
      </div>
    );
  }

  return (
    <section className="w-full flex flex-col gap-4" data-cy="user-permission-form-section">
      <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('title')}</h3>

      {isSsoManaged ? (
        <div
          className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-warning-700"
          data-cy="user-permission-form-sso-managed"
        >
          <p className="text-sm font-semibold">{t('ssoManaged.title')}</p>
          <p className="text-sm">{t('ssoManaged.description', { providers: ssoProvidersLabel })}</p>
        </div>
      ) : null}

      {/* Manageable roles */}
      <div className="flex flex-col gap-3">
        {manageableRoles.map((role) => {
          const ssoAssignments = ssoAssignmentsByRoleId.get(role.id) ?? [];
          return (
            <div key={role.id} className="flex flex-col">
              <LabeledSwitch
                isSelected={selectedRoleIds.has(role.id)}
                onChange={handleRoleToggle(role.id)}
                isDisabled={isRoleSsoManaged(role.key)}
                data-cy={`user-permission-form-${role.key}-checkbox`}
              >
                {tExists(`permissions.${role.key}`) ? t(`permissions.${role.key}`) : role.name}
              </LabeledSwitch>
              <SsoAssignmentBadges assignments={ssoAssignments} providersById={providersById} t={t} />
            </div>
          );
        })}
      </div>

      {/* SSO-only roles (not in manageable list) */}
      {ssoOnlyRoles.length > 0 ? (
        <>
          <Separator />
          <div className="flex flex-col gap-2" data-cy="user-permission-form-sso-only-roles">
            <p className="text-xs font-semibold text-default-500 uppercase tracking-wide">
              {t('ssoOnlyRoles.title')}
            </p>
            <p className="text-xs text-default-400">{t('ssoOnlyRoles.subtitle')}</p>
            {ssoOnlyRoles.map(({ role, assignments }) => {
              const roleName = role?.name ?? role?.key ?? `Role #${assignments[0]?.roleId}`;
              return (
                <div key={role?.id ?? assignments[0]?.roleId} className="flex flex-col gap-1">
                  <span className="text-sm text-default-700 font-medium">{roleName}</span>
                  <SsoAssignmentBadges assignments={assignments} providersById={providersById} t={t} />
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <div className="flex w-full justify-end">
        <Button
          variant="primary"
          onPress={handleSave}
          isPending={isSaving}
          isDisabled={allManageableSsoManaged}
          data-cy="user-permission-form-save-button"
        >
          {t('actions.save')}
        </Button>
      </div>
    </section>
  );
};
