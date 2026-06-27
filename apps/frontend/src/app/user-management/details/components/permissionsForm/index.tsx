import React, { useEffect, useState } from 'react';
import { Button } from '../../../../../components/button';
import { LabeledSwitch } from '../../../../../components/labeledSwitch';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import {
  ApiError,
  User,
  useRbacServiceListRoles,
  useUsersServiceGetUserRoleAssignments,
  useUsersServiceAssignRoleToUser,
  useUsersServiceRevokeRoleFromUser,
  useUsersServiceGetUserRoleAssignmentsKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';

import en from './en.json';
import de from './de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';

// Roles shown in the permissions form (default 'user' and 'owner' are excluded)
const MANAGEABLE_ROLE_KEYS = ['resource-manager', 'system-admin', 'user-manager', 'billing-manager'];

interface UserPermissionFormProps {
  user: User;
  ssoManagedProviders?: string[];
  ssoManagedPermissionKeys?: Set<string>;
}

export const UserPermissionForm: React.FC<UserPermissionFormProps> = ({ user, ssoManagedProviders, ssoManagedPermissionKeys }) => {
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

  const manageableRoles = (allRoles ?? []).filter((r) => MANAGEABLE_ROLE_KEYS.includes(r.key));

  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (userRoles) {
      setSelectedRoleIds(new Set(userRoles.map((ur) => ur.roleId)));
    }
  }, [userRoles]);

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

    try {
      await Promise.all([
        ...toAssign.map((roleId) => assignRole({ id: user.id, requestBody: { roleId } })),
        ...toRevoke.map((roleId) => revokeRole({ id: user.id, roleId })),
      ]);

      await queryClient.invalidateQueries({ queryKey: [useUsersServiceGetUserRoleAssignmentsKey] });
      toast.success({ title: t('messages.updated') });
    } catch (error) {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
        fallbackKey: 'generic',
      });
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
      <div className="flex flex-col gap-2">
        {manageableRoles.map((role) => (
          <LabeledSwitch
            key={role.id}
            isSelected={selectedRoleIds.has(role.id)}
            onChange={handleRoleToggle(role.id)}
            isDisabled={isRoleSsoManaged(role.key)}
            data-cy={`user-permission-form-${role.key}-checkbox`}
          >
            {t(`permissions.${role.key}`)}
          </LabeledSwitch>
        ))}
      </div>
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
