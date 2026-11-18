import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { RoleWithUsageDto, useListPermissions, useListRoles } from '@attraccess/react-query-client';
import { Button, TableDataLoadingIndicator, useTranslations } from '@attraccess/plugins-frontend-ui';
import { SettingsSection } from '../../components/SettingsSection';
import { RoleFormDrawer } from '../../../roles/role-form-drawer/index';
import { DeleteRoleModal } from '../../../roles/delete-role-modal/index';
import { RolesSectionTable } from './RolesSectionTable';
import en from './en.json';
import de from './de.json';

/**
 * Roles were already at `/settings/roles`, so only the frame changed: the standalone `PageHeader`
 * and its action gave way to the section heading and an inline Create button. The drawer and the
 * delete modal are reused untouched — they are their own resources, not fields of this section, so
 * they keep committing on their own and there is no save bar here.
 */
export function RolesSection() {
  const { t } = useTranslations({ en, de });
  const { data: roles, isLoading } = useListRoles();
  // Requested alongside the roles, not from the table once they have loaded.
  const { data: permissions } = useListPermissions();
  const [formRole, setFormRole] = useState<RoleWithUsageDto | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<RoleWithUsageDto | null>(null);

  const openForm = (role: RoleWithUsageDto | null) => {
    setFormRole(role);
    setIsFormOpen(true);
  };

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
            roles={roles ?? []}
            permissions={permissions}
            onEdit={openForm}
            onDelete={setRoleToDelete}
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
