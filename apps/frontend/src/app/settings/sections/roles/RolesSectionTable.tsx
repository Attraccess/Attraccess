import { EyeIcon, LockIcon, PencilIcon, Trash2Icon } from 'lucide-react';
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
import { useNavigate } from 'react-router-dom';
import { Permission, RoleWithUsageDto } from '@attraccess/react-query-client';
import {
  Button,
  EmptyState,
  TableActionsColumnHeader,
  TableRowActions,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import { useRbacCatalogTranslations } from '../../../../hooks/useRbacCatalogTranslations';
import en from './en.json';
import de from './de.json';

interface RolesSectionTableProps {
  roles: RoleWithUsageDto[];
  /** The permission catalog, loaded by the section in parallel with the roles; `undefined` until it arrives. */
  permissions: Permission[] | undefined;
  onEdit: (role: RoleWithUsageDto) => void;
  onDelete: (role: RoleWithUsageDto) => void;
}

export function RolesSectionTable({ roles, permissions, onEdit, onDelete }: RolesSectionTableProps) {
  const { t } = useTranslations({ en, de });
  const { permissionLabel, roleName, roleDescription } = useRbacCatalogTranslations();
  const navigate = useNavigate();
  return (
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

          <TableBody items={roles ?? []} dependencies={[t]} renderEmptyState={() => <EmptyState />}>
            {(role) => (
              <TableRow
                key={role.id}
                id={role.id}
                className="cursor-pointer"
                onAction={() => onEdit(role)}
                data-cy={`roles-table-row-${role.key}`}
              >
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{roleName(role)}</span>
                    {role.description ? (
                      <span className="text-xs text-muted line-clamp-1">{roleDescription(role)}</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {role.isSystemManaged ? (
                    <Tooltip>
                      <TooltipTrigger tabIndex={0}>
                        <Chip size="sm" color="default" variant="secondary" data-cy={`role-source-chip-${role.key}`}>
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
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-6 min-w-6 p-0"
                        aria-label={t('table.actions.viewPermissions', { role: roleName(role) })}
                        onPress={() => onEdit(role)}
                        data-cy={`roles-table-permissions-${role.key}`}
                      >
                        <Chip size="sm" variant="secondary" className="pointer-events-none min-h-6 min-w-6">
                          {role.rolePermissions?.length ?? 0}
                        </Chip>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent showArrow>
                      <div className="max-w-64">
                        {(role.rolePermissions ?? []).length > 0 ? (
                          <ul className="list-disc pl-4 text-left">
                            {role.rolePermissions?.map(({ permissionKey }) => (
                              <li key={permissionKey}>
                                {permissionLabel(
                                  permissions?.find((permission) => permission.key === permissionKey) ?? {
                                    key: permissionKey,
                                  },
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          t('table.noPermissions')
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-6 min-w-6 p-0"
                    aria-label={t('table.actions.viewUsers', { role: roleName(role) })}
                    onPress={() => navigate(`/users?roleId=${role.id}`)}
                    data-cy={`roles-table-users-${role.key}`}
                  >
                    <Chip size="sm" variant="secondary" className="pointer-events-none min-h-6 min-w-6">
                      {role.userCount}
                    </Chip>
                  </Button>
                </TableCell>
                <TableCell>
                  <TableRowActions
                    itemName={roleName(role)}
                    data-cy={`roles-table-actions-${role.key}`}
                    actions={[
                      {
                        key: 'edit',
                        label: role.isSystemManaged ? t('table.actions.view') : t('table.actions.edit'),
                        icon: role.isSystemManaged ? EyeIcon : PencilIcon,
                        onPress: () => onEdit(role),
                        'data-cy': `roles-table-edit-${role.key}`,
                      },
                      {
                        key: 'delete',
                        label: t('table.actions.delete'),
                        icon: Trash2Icon,
                        tone: 'danger',
                        isHidden: role.isSystemManaged,
                        onPress: () => onDelete(role),
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
  );
}
