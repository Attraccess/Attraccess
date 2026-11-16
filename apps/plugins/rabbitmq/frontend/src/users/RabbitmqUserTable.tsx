import {
  Button,
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
import { useRabbitmqTranslations } from '../i18n';
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
  onDelete: (user: RabbitmqUser) => void;
}

export function RabbitmqUserTable({ users, canManage, onEdit, onPermissions, onDelete }: RabbitmqUserTableProps) {
  const { t, language } = useRabbitmqTranslations();
  return (
    <Table data-cy="rabbitmq-user-panel-table">
      <TableScrollContainer>
        <TableContent aria-label={t('users.title')}>
          <TableHeader>
            <TableColumn isRowHeader>{t('users.username')}</TableColumn>
            <TableColumn>{t('users.tags')}</TableColumn>
            <TableColumn>{t('users.access')}</TableColumn>
            {canManage && <TableColumn>{t('common.actions')}</TableColumn>}
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
                    <div className="rmq:flex rmq:flex-row rmq:gap-1">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={t('users.edit', { name: user.name })}
                        onPress={() => onEdit(user)}
                        data-cy={`rabbitmq-user-edit-button-${user.name}`}
                      >
                        <PencilIcon className="rmq:w-4 rmq:h-4" />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={t('users.permissions', { name: user.name })}
                        onPress={() => onPermissions(user)}
                        data-cy={`rabbitmq-user-permissions-button-${user.name}`}
                      >
                        <KeyRoundIcon className="rmq:w-4 rmq:h-4" />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={t('users.delete', { name: user.name })}
                        onPress={() => onDelete(user)}
                        data-cy={`rabbitmq-user-delete-button-${user.name}`}
                      >
                        <Trash2Icon className="rmq:w-4 rmq:h-4 rmq:text-danger" />
                      </Button>
                    </div>
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
