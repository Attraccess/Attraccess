// RabbitMQ user-management panel for the MQTT server detail slot (ATT-522).
//
// Appears below the status panel for MQTT servers detected as RabbitMQ brokers
// with working management credentials. Lists the broker's users with their
// tags and per-vhost permissions, and offers create / edit / permission /
// delete actions. All operations go through the plugin backend, which talks to
// the RabbitMQ management HTTP API with the MQTT server's credentials.
import { StatusAlert, TableDataLoadingIndicator, type TranslationMessage } from '@attraccess/plugins-frontend-ui';
import { Card } from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDetection } from '../detection/detection';
import { useRabbitmqTranslations } from '../i18n';
import { RabbitmqPermissionsModal } from './permissions/RabbitmqPermissionsModal';
import { RabbitmqUserDeleteDialog } from './RabbitmqUserDeleteDialog';
import { RabbitmqUserFormModal } from './RabbitmqUserFormModal';
import { RabbitmqUserPanelCardHeader } from './RabbitmqUserPanelCardHeader';
import { RabbitmqUserTable } from './RabbitmqUserTable';
import { errorTitle } from './errorTitle';
import { fetchUsers, type RabbitmqUser, type RabbitmqUserList } from './users-api';

export function RabbitmqUserPanel({ mqttServerId, canManage = false }: { mqttServerId: number; canManage?: boolean }) {
  const { t, tMessage } = useRabbitmqTranslations();
  const { result } = useDetection(mqttServerId);

  const [data, setData] = useState<RabbitmqUserList | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | TranslationMessage | null>(null);

  // Modal state. `formUser` doubles as the mode flag (null = create).
  const [formOpen, setFormOpen] = useState(false);
  const [formUser, setFormUser] = useState<RabbitmqUser | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<RabbitmqUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<RabbitmqUser | null>(null);

  // The panel can unmount while a fetch is in flight (navigation away) — drop
  // the result instead of calling setState on an unmounted component.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchUsers(mqttServerId);
      if (mounted.current) {
        setData(list);
        // Keep the permissions modal's user in sync after edits.
        setPermissionsUser((current) =>
          current ? (list.users.find((user) => user.name === current.name) ?? current) : null,
        );
      }
    } catch (err) {
      if (mounted.current) {
        setLoadError(err instanceof Error ? err.message : { key: 'users.loadError' });
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [mqttServerId]);

  const manageable = result?.isRabbitMQ === true && result.authOk;

  useEffect(() => {
    if (manageable) {
      void reload();
    }
  }, [manageable, reload]);

  // Render nothing unless the server is positively detected as RabbitMQ with
  // working management credentials — the status panel already explains
  // detection / auth problems.
  if (!manageable) {
    return null;
  }
  return (
    <Card
      data-cy={`rabbitmq-user-panel-${mqttServerId}`}
      className="rmq:w-full rmq:border rmq:border-default-200 rmq:dark:border-default-100"
    >
      <RabbitmqUserPanelCardHeader
        reload={reload}
        loading={loading}
        mqttServerId={mqttServerId}
        onCreate={() => {
          setFormUser(null);
          setFormOpen(true);
        }}
        canManage={canManage}
      />
      <Card.Content className="rmq:flex rmq:flex-col rmq:gap-3">
        {loadError && (
          <StatusAlert
            status="danger"
            title={errorTitle(loadError, t('users.loadError'))}
            data-cy="rabbitmq-user-panel-error-alert"
          >
            {tMessage(loadError)}
          </StatusAlert>
        )}

        {!data && !loadError && (
          <div data-cy="rabbitmq-user-panel-loading-spinner">
            <TableDataLoadingIndicator />
          </div>
        )}

        {data && (
          <RabbitmqUserTable
            users={data.users}
            canManage={canManage}
            onEdit={(user) => {
              setFormUser(user);
              setFormOpen(true);
            }}
            onPermissions={setPermissionsUser}
            onDelete={setUserToDelete}
          />
        )}
      </Card.Content>

      <RabbitmqUserFormModal
        mqttServerId={mqttServerId}
        isOpen={formOpen}
        user={formUser}
        vhosts={data?.vhosts ?? []}
        existingUsernames={data?.users.map((user) => user.name)}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />

      <RabbitmqPermissionsModal
        mqttServerId={mqttServerId}
        isOpen={permissionsUser !== null}
        user={permissionsUser}
        vhosts={data?.vhosts ?? []}
        onClose={() => setPermissionsUser(null)}
        onSaved={() => void reload()}
      />

      <RabbitmqUserDeleteDialog
        mqttServerId={mqttServerId}
        user={userToDelete}
        onClose={() => setUserToDelete(null)}
        onDeleted={() => void reload()}
      />
    </Card>
  );
}
