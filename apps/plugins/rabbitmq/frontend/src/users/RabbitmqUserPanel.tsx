// RabbitMQ user-management panel for the MQTT server detail slot (ATT-522).
//
// Appears below the status panel for MQTT servers detected as RabbitMQ brokers
// with working management credentials. Lists the broker's users with their
// tags and per-vhost permissions, and offers create / edit / permission /
// delete actions. All operations go through the plugin backend, which talks to
// the RabbitMQ management HTTP API with the MQTT server's credentials.
import {
  StatusAlert,
  StatusDialog,
  TableDataLoadingIndicator,
  type TranslationMessage,
} from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Card,
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
import { type RabbitmqUser } from './users-api';
import { RabbitmqPermissionsModal } from './permissions/RabbitmqPermissionsModal';
import { RabbitmqUserFormModal } from './RabbitmqUserFormModal';
import { useRabbitmqTranslations } from '../i18n';
import { useRabbitmqUserPanelState } from './useRabbitmqUserPanelState';
import { RabbitmqUserPanelCardHeader } from './RabbitmqUserPanelCardHeader';

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

// A failure without a server message falls back to the generic text, which is
// already the title — show it only once, as the description.
function errorTitle(error: string | TranslationMessage, title: string) {
  return typeof error === 'string' ? title : undefined;
}

export function RabbitmqUserPanel({ mqttServerId }: { mqttServerId: number }) {
  const model = useRabbitmqUserPanelState({ mqttServerId });

  // Render nothing unless the server is positively detected as RabbitMQ with
  // working management credentials — the status panel already explains
  // detection / auth problems.
  if (!model.manageable) {
    return null;
  }
  return (
    <Card
      data-cy={`rabbitmq-user-panel-${mqttServerId}`}
      className="rmq:w-full rmq:border rmq:border-default-200 rmq:dark:border-default-100"
    >
      <RabbitmqUserPanelCardHeader
        {...{
          t: model.t,
          reload: model.reload,
          loading: model.loading,
          mqttServerId,
          setFormUser: model.setFormUser,
          setFormOpen: model.setFormOpen,
        }}
      />
      <Card.Content className="rmq:flex rmq:flex-col rmq:gap-3">
        {model.loadError && (
          <StatusAlert
            status="danger"
            title={errorTitle(model.loadError, model.t('users.loadError'))}
            data-cy="rabbitmq-user-panel-error-alert"
          >
            {model.tMessage(model.loadError)}
          </StatusAlert>
        )}

        {!model.data && !model.loadError && (
          <div data-cy="rabbitmq-user-panel-loading-spinner">
            <TableDataLoadingIndicator />
          </div>
        )}

        {model.data && (
          <Table data-cy="rabbitmq-user-panel-table">
            <TableScrollContainer>
              <TableContent aria-label={model.t('users.title')}>
                <TableHeader>
                  <TableColumn isRowHeader>{model.t('users.username')}</TableColumn>
                  <TableColumn>{model.t('users.tags')}</TableColumn>
                  <TableColumn>{model.t('users.access')}</TableColumn>
                  <TableColumn>{model.t('users.actions')}</TableColumn>
                </TableHeader>
                <TableBody items={model.data.users} dependencies={[model.language]}>
                  {(user) => (
                    <TableRow key={user.name} id={user.name}>
                      <TableCell className="rmq:whitespace-nowrap rmq:font-medium">{user.name}</TableCell>
                      <TableCell>
                        {user.tags.length === 0 ? (
                          <span className="rmq:text-xs rmq:text-default-400">{model.t('users.none')}</span>
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
                      <TableCell>
                        <div className="rmq:flex rmq:flex-row rmq:gap-1">
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            aria-label={model.t('users.edit', { name: user.name })}
                            onPress={() => {
                              model.setFormUser(user);
                              model.setFormOpen(true);
                            }}
                            data-cy={`rabbitmq-user-edit-button-${user.name}`}
                          >
                            <PencilIcon className="rmq:w-4 rmq:h-4" />
                          </Button>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            aria-label={model.t('users.permissions', { name: user.name })}
                            onPress={() => model.setPermissionsUser(user)}
                            data-cy={`rabbitmq-user-permissions-button-${user.name}`}
                          >
                            <KeyRoundIcon className="rmq:w-4 rmq:h-4" />
                          </Button>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            aria-label={model.t('users.delete', { name: user.name })}
                            onPress={() => {
                              model.setDeleteError(null);
                              model.setUserToDelete(user);
                            }}
                            data-cy={`rabbitmq-user-delete-button-${user.name}`}
                          >
                            <Trash2Icon className="rmq:w-4 rmq:h-4 rmq:text-danger" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </TableContent>
            </TableScrollContainer>
          </Table>
        )}
      </Card.Content>

      <RabbitmqUserFormModal
        mqttServerId={mqttServerId}
        isOpen={model.formOpen}
        user={model.formUser}
        vhosts={model.data?.vhosts ?? []}
        onClose={() => model.setFormOpen(false)}
        onSaved={() => void model.reload()}
      />

      <RabbitmqPermissionsModal
        mqttServerId={mqttServerId}
        isOpen={model.permissionsUser !== null}
        user={model.permissionsUser}
        vhosts={model.data?.vhosts ?? []}
        onClose={() => model.setPermissionsUser(null)}
        onSaved={() => void model.reload()}
      />

      <StatusDialog
        isOpen={model.userToDelete !== null}
        onClose={() => model.setUserToDelete(null)}
        status="error"
        title={model.t('users.deleteTitle')}
        action={{
          label: model.t('common.delete'),
          onPress: model.confirmDelete,
          isPending: model.deleting,
          'data-cy': 'rabbitmq-user-delete-confirm-button',
        }}
        closeLabel={model.t('common.cancel')}
        closeDataCy="rabbitmq-user-delete-cancel-button"
        data-cy={`rabbitmq-user-delete-modal-${mqttServerId}`}
      >
        <div className="rmq:flex rmq:flex-col rmq:gap-3">
          <p>{model.t('users.deleteDescription', { name: model.userToDelete?.name })}</p>
          {model.deleteError && (
            <StatusAlert
              status="danger"
              title={errorTitle(model.deleteError, model.t('users.deleteError'))}
              data-cy="rabbitmq-user-delete-error-alert"
            >
              {model.tMessage(model.deleteError)}
            </StatusAlert>
          )}
        </div>
      </StatusDialog>
    </Card>
  );
}
