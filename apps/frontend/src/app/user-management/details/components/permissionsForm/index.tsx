import { Button } from '../../../../../components/button';
import { LabeledSwitch } from '../../../../../components/labeledSwitch';
import { Separator } from '@heroui/react';
import { UserPermissionFormProps } from './index.user-permission-form-props';
import { SsoAssignmentBadges } from './index.sso-assignment-badges';
import { useUserPermissionFormState } from './useUserPermissionFormState';

// 'user' is auto-assigned to all users; 'administrator' is the initial system administrator — neither should be toggled manually
export function UserPermissionForm({
  user,
  ssoManagedProviders,
  ssoManagedPermissionKeys,
  providersById,
  roleIdToAssign,
}: UserPermissionFormProps) {
  const {
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
  } = useUserPermissionFormState({
    user,
    ssoManagedProviders,
    ssoManagedPermissionKeys,
    providersById,
    roleIdToAssign,
  });

  if (isLoadingRoles || isLoadingUserRoles) {
    return (
      <div className="flex justify-center p-4" data-cy="user-permission-form-loading">
        Loading permissions...
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4" data-cy="user-permission-form-section">
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
                {roleName(role)}
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
            <p className="text-xs font-semibold text-default-500 uppercase tracking-wide">{t('ssoOnlyRoles.title')}</p>
            <p className="text-xs text-default-400">{t('ssoOnlyRoles.subtitle')}</p>
            {ssoOnlyRoles.map(({ role, assignments }) => {
              const label = role ? roleName(role) : `Role #${assignments[0]?.roleId}`;
              return (
                <div key={role?.id ?? assignments[0]?.roleId} className="flex flex-col gap-1">
                  <span className="text-sm text-default-700 font-medium">{label}</span>
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
    </div>
  );
}
