import { TableActionsColumnHeader, TableRowActions } from '@attraccess/plugins-frontend-ui';
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
} from '@heroui/react';
import { KeyRoundIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useRef } from 'react';
import { useRabbitmqTranslations } from '../i18n';
import { RabbitmqUserDeleteMessage, type RabbitmqUserDeleteMessageHandle } from './RabbitmqUserDeleteMessage';
import type { RabbitmqUser } from './users-api';

function PermissionChips({ user }: { user: RabbitmqUser }) {
  const { t } = useRabbitmqTranslations();
  if (user.permissions.length === 0) {
    return <span className="rmq:text-xs rmq:text-default-400">{t('users.none')}</span>;
  }
  return (
    <div className="rmq:flex rmq:flex-wrap rmq:gap-1">
      {user.permissions.map((permission) => (
        <Chip key={permission.vhost} size="sm" variant="soft" title={t('permissions.summary', { ...permission })}>
          {permission.vhost}
        </Chip>
      ))}
    </div>
  );
}

interface RabbitmqUserTableProps {
  users: RabbitmqUser[];
  canManage: boolean;
  onEdit: (user: RabbitmqUser) => void;
  onPermissions: (user: RabbitmqUser) => void;
  /** Deletes the user after confirmation; a rejection keeps the dialog open and shows the error. */
  onDelete: (user: RabbitmqUser) => Promise<unknown>;
}

export function RabbitmqUserTable({ users, canManage, onEdit, onPermissions, onDelete }: RabbitmqUserTableProps) {
  const { t, language } = useRabbitmqTranslations();
  const deleteMessage = useRef<RabbitmqUserDeleteMessageHandle>(null);

  const confirmDelete = async (user: RabbitmqUser) => {
    deleteMessage.current?.showError(null);
    try {
      await onDelete(user);
    } catch (err) {
      deleteMessage.current?.showError(err instanceof Error ? err.message : { key: 'users.deleteError' });
      throw err;
    }
  };

  return (
    <Table data-cy="rabbitmq-user-panel-table">
      <TableScrollContainer>
        <TableContent aria-label={t('users.title')}>
          <TableHeader>
            <TableColumn isRowHeader>{t('users.username')}</TableColumn>
            <TableColumn>{t('users.tags')}</TableColumn>
            <TableColumn>{t('users.access')}</TableColumn>
            {canManage && (
              <TableColumn id="actions">
                <TableActionsColumnHeader />
              </TableColumn>
            )}
          </TableHeader>
          <TableBody items={users} dependencies={[language]}>
            {(user) => (
              <TableRow key={user.name} id={user.name}>
                <TableCell className="rmq:whitespace-nowrap rmq:font-medium">{user.name}</TableCell>
                <TableCell>
                  {user.tags.length === 0 ? (
                    <span className="rmq:text-xs rmq:text-default-400">{t('users.none')}</span>
                  ) : (
                    <div className="rmq:flex rmq:flex-wrap rmq:gap-1">
                      {user.tags.map((tag) => (
                        <Chip key={tag} size="sm" color="accent" variant="soft">
                          {tag}
                        </Chip>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <PermissionChips user={user} />
                </TableCell>
                {canManage && (
                  <TableCell>
                    <TableRowActions
                      itemName={user.name}
                      actions={[
                        {
                          key: 'edit',
                          label: t('users.edit'),
                          icon: PencilIcon,
                          onPress: () => onEdit(user),
                          'data-cy': `rabbitmq-user-edit-button-${user.name}`,
                        },
                        {
                          key: 'permissions',
                          label: t('users.permissions'),
                          icon: KeyRoundIcon,
                          onPress: () => onPermissions(user),
                          'data-cy': `rabbitmq-user-permissions-button-${user.name}`,
                        },
                        {
                          key: 'delete',
                          label: t('users.deleteTitle'),
                          icon: Trash2Icon,
                          tone: 'danger',
                          onPress: () => confirmDelete(user),
                          'data-cy': `rabbitmq-user-delete-button-${user.name}`,
                          confirm: {
                            title: t('users.deleteTitle'),
                            message: <RabbitmqUserDeleteMessage name={user.name} ref={deleteMessage} />,
                            confirmLabel: t('common.delete'),
                            cancelLabel: t('common.cancel'),
                            'data-cy': `rabbitmq-user-delete-modal-${user.name}`,
                            confirmDataCy: 'rabbitmq-user-delete-confirm-button',
                            cancelDataCy: 'rabbitmq-user-delete-cancel-button',
                          },
                        },
                      ]}
                    />
                  </TableCell>
                )}
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}
