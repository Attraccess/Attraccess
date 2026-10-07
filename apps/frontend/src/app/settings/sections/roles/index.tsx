import { PlusIcon } from 'lucide-react';
import { SettingsSection } from '../../components/SettingsSection';
import { Button } from '../../../../components/button';
import { TableDataLoadingIndicator } from '../../../../components/tableComponents';
import { RoleFormDrawer } from '../../../roles/role-form-drawer';
import { DeleteRoleModal } from '../../../roles/delete-role-modal';
import { useRolesSectionState } from './useRolesSectionState';
import { RolesSectionTable } from './RolesSectionTable';

/**
 * Roles were already at `/settings/roles`, so only the frame changed: the standalone `PageHeader`
 * and its action gave way to the section heading and an inline Create button. The drawer and the
 * delete modal are reused untouched — they are their own resources, not fields of this section, so
 * they keep committing on their own and there is no save bar here.
 */
export function RolesSection() {
  const {
    t,
    permissionLabel,
    roleName,
    roleDescription,
    navigate,
    roles,
    isLoading,
    permissions,
    formRole,
    isFormOpen,
    setIsFormOpen,
    roleToDelete,
    setRoleToDelete,
    openForm,
  } = useRolesSectionState();

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <div data-cy="roles-page" className="flex flex-col gap-4">
        <div className="flex">
          <Button variant="primary" size="sm" onPress={() => openForm(null)} data-cy="roles-page-create-role-button">
            <PlusIcon className="w-4 h-4" />
            {t('actions.createRole')}
          </Button>
        </div>

        {isLoading ? (
          <TableDataLoadingIndicator />
        ) : (
          <RolesSectionTable
            {...{
              t,
              roles,
              openForm,
              roleName,
              roleDescription,
              permissionLabel,
              permissions,
              navigate,
              setRoleToDelete,
            }}
          />
        )}
      </div>

      <RoleFormDrawer isOpen={isFormOpen} onOpenChange={setIsFormOpen} role={formRole} />
      <DeleteRoleModal
        isOpen={roleToDelete !== null}
        onClose={() => setRoleToDelete(null)}
        role={roleToDelete}
        allRoles={roles ?? []}
      />
    </SettingsSection>
  );
}

export default RolesSection;
