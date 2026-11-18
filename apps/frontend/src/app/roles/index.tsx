import React, { useState } from 'react';
import {
  EmptyState,
  PageAction,
  PageHeader,
  TableActionsColumnHeader,
  TableDataLoadingIndicator,
  TableRowActions,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@heroui/react';
import { EyeIcon, LockIcon, PencilIcon, PlusIcon, ShieldIcon, Trash2Icon } from 'lucide-react';
import { RoleWithUsageDto, useListRoles } from '@attraccess/react-query-client';
import { RoleFormDrawer } from './role-form-drawer';
import { DeleteRoleModal } from './delete-role-modal';
import { useRbacCatalogTranslations } from '../../hooks/useRbacCatalogTranslations';

import en from './en.json';
import de from './de.json';

export const RolesPage: React.FC = () => {
  const { t } = useTranslations({ en, de });
  const { roleName, roleDescription } = useRbacCatalogTranslations();

  const { data: roles, isLoading } = useListRoles();

  const [formRole, setFormRole] = useState<RoleWithUsageDto | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<RoleWithUsageDto | null>(null);

  const openForm = (role: RoleWithUsageDto | null) => {
    setFormRole(role);
    setIsFormOpen(true);
  };

  return (
    <div data-cy="roles-page">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        backTo="/"
        icon={<ShieldIcon className="w-6 h-6" />}
        data-cy="roles-page-header"
        actions={
          [
            {
              key: 'create-role',
              label: t('actions.createRole'),
              icon: <PlusIcon className="w-4 h-4" />,
              variant: 'primary',
              onPress: () => openForm(null),
              dataCy: 'roles-page-create-role-button',
            },
          ] satisfies PageAction[]
        }
      />

      <div className="mt-6">
        {isLoading ? (
          <TableDataLoadingIndicator />
        ) : (
          <Table>
            <TableScrollContainer>
              <TableContent aria-label={t('table.ariaLabel')}>
                <TableHeader>
                  <TableColumn isRowHeader>{t('table.columns.name')}</TableColumn>
                  <TableColumn width="0">{t('table.columns.source')}</TableColumn>
                  <TableColumn width="0" className="hidden sm:table-cell text-center">
                    {t('table.columns.permissions')}
                  </TableColumn>
                  <TableColumn width="0" className="hidden sm:table-cell text-center">
                    {t('table.columns.users')}
                  </TableColumn>
                  <TableColumn id="actions">
                    <TableActionsColumnHeader />
                  </TableColumn>
                </TableHeader>

                <TableBody items={roles ?? []} renderEmptyState={() => <EmptyState />}>
                  {(role) => (
                    <TableRow
                      key={role.id}
                      id={role.id}
                      className="cursor-pointer hover:bg-primary-50 transition-bg duration-300"
                      onAction={() => openForm(role)}
                      data-cy={`roles-table-row-${role.key}`}
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{roleName(role)}</span>
                          {role.description ? (
                            <span className="text-xs text-default-400 line-clamp-1">{roleDescription(role)}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {role.isSystemManaged ? (
                          <Tooltip>
                            <TooltipTrigger tabIndex={0}>
                              <Chip
                                size="sm"
                                color="default"
                                variant="secondary"
                                data-cy={`role-source-chip-${role.key}`}
                              >
                                <LockIcon className="w-3 h-3 mr-1" />
                                {t('table.source.system')}
                              </Chip>
                            </TooltipTrigger>
                            <TooltipContent showArrow>{t('table.systemRoleTooltip')}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Chip size="sm" color="accent" variant="secondary" data-cy={`role-source-chip-${role.key}`}>
                            {t('table.source.custom')}
                          </Chip>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-center">
                        {role.rolePermissions?.length ?? 0}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-center">{role.userCount}</TableCell>
                      <TableCell>
                        <TableRowActions
                          itemName={roleName(role)}
                          data-cy={`roles-table-actions-${role.key}`}
                          actions={[
                            {
                              key: 'edit',
                              label: role.isSystemManaged ? t('table.actions.view') : t('table.actions.edit'),
                              icon: role.isSystemManaged ? EyeIcon : PencilIcon,
                              onPress: () => openForm(role),
                              'data-cy': `roles-table-edit-${role.key}`,
                            },
                            {
                              key: 'delete',
                              label: t('table.actions.delete'),
                              icon: Trash2Icon,
                              tone: 'danger',
                              isHidden: role.isSystemManaged,
                              onPress: () => setRoleToDelete(role),
                              'data-cy': `roles-table-delete-${role.key}`,
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </TableContent>
            </TableScrollContainer>
          </Table>
        )}
      </div>

      <RoleFormDrawer isOpen={isFormOpen} onOpenChange={setIsFormOpen} role={formRole} />
      <DeleteRoleModal
        isOpen={roleToDelete !== null}
        onClose={() => setRoleToDelete(null)}
        role={roleToDelete}
        allRoles={roles ?? []}
      />
    </div>
  );
};

export default RolesPage;
