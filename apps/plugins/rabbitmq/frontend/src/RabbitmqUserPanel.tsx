// RabbitMQ user-management panel for the MQTT server detail slot (ATT-522).
//
// Appears below the status panel for MQTT servers detected as RabbitMQ brokers
// with working management credentials. Lists the broker's users with their
// tags and per-vhost permissions, and offers create / edit / permission /
// delete actions. All operations go through the plugin backend, which talks to
// the RabbitMQ management HTTP API with the MQTT server's credentials.
import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  Card,
  Chip,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { KeyRoundIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDetection } from './detection';
import { deleteUser, fetchUsers, type RabbitmqUser, type RabbitmqUserList } from './users-api';
import { RabbitmqPermissionsModal } from './RabbitmqPermissionsModal';
import { RabbitmqUserFormModal } from './RabbitmqUserFormModal';

function PermissionChips({ user }: { user: RabbitmqUser }) {
  if (user.permissions.length === 0) {
    return <span className="rmq:text-xs rmq:text-default-400">none</span>;
  }
  return (
    <div className="rmq:flex rmq:flex-wrap rmq:gap-1">
      {user.permissions.map((permission) => (
        <Chip
          key={permission.vhost}
          size="sm"
          variant="soft"
          title={`configure: ${permission.configure}\nwrite: ${permission.write}\nread: ${permission.read}`}
        >
          {permission.vhost}
        </Chip>
      ))}
    </div>
  );
}

export function RabbitmqUserPanel({ mqttServerId }: { mqttServerId: number }) {
  const { result } = useDetection(mqttServerId);

  const [data, setData] = useState<RabbitmqUserList | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modal state. `formUser` doubles as the mode flag (null = create).
  const [formOpen, setFormOpen] = useState(false);
  const [formUser, setFormUser] = useState<RabbitmqUser | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<RabbitmqUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<RabbitmqUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        setLoadError(err instanceof Error ? err.message : 'Loading users failed.');
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

  const confirmDelete = async () => {
    if (!userToDelete) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUser(mqttServerId, userToDelete.name);
      setUserToDelete(null);
      void reload();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Deleting the user failed.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card
      data-cy={`rabbitmq-user-panel-${mqttServerId}`}
      className="rmq:w-full rmq:border rmq:border-default-200 rmq:dark:border-default-100"
    >
      <Card.Header className="rmq:flex rmq:flex-row rmq:items-center rmq:justify-between rmq:gap-2">
        <div className="rmq:flex rmq:items-center rmq:gap-2">
          <UsersIcon className="rmq:w-5 rmq:h-5 rmq:text-primary" />
          <p className="rmq:text-base rmq:font-semibold rmq:text-default-700">RabbitMQ users</p>
        </div>
        <div className="rmq:flex rmq:items-center rmq:gap-2">
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label="Reload RabbitMQ users"
            onPress={() => void reload()}
            isDisabled={loading}
            data-cy={`rabbitmq-user-panel-reload-${mqttServerId}`}
          >
            {loading ? <Spinner size="sm" /> : <RefreshCwIcon className="rmq:w-4 rmq:h-4" />}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onPress={() => {
              setFormUser(null);
              setFormOpen(true);
            }}
            data-cy={`rabbitmq-user-panel-create-button-${mqttServerId}`}
          >
            <PlusIcon className="rmq:w-4 rmq:h-4" />
            Add user
          </Button>
        </div>
      </Card.Header>
      <Card.Content className="rmq:flex rmq:flex-col rmq:gap-3">
        {loadError && (
          <Alert status="danger" data-cy="rabbitmq-user-panel-error-alert">
            <AlertContent>
              <AlertDescription>{loadError}</AlertDescription>
            </AlertContent>
          </Alert>
        )}

        {!data && !loadError && (
          <div className="rmq:flex rmq:items-center rmq:justify-center rmq:p-4">
            <Spinner data-cy="rabbitmq-user-panel-loading-spinner" />
          </div>
        )}

        {data && (
          <Table data-cy="rabbitmq-user-panel-table">
            <TableScrollContainer>
              <TableContent aria-label="RabbitMQ users">
                <TableHeader>
                  <TableColumn isRowHeader>Username</TableColumn>
                  <TableColumn>Tags</TableColumn>
                  <TableColumn>Vhost access</TableColumn>
                  <TableColumn>Actions</TableColumn>
                </TableHeader>
                <TableBody items={data.users}>
                  {(user) => (
                    <TableRow key={user.name} id={user.name}>
                      <TableCell className="rmq:whitespace-nowrap rmq:font-medium">{user.name}</TableCell>
                      <TableCell>
                        {user.tags.length === 0 ? (
                          <span className="rmq:text-xs rmq:text-default-400">none</span>
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
                            aria-label={`Edit user ${user.name}`}
                            onPress={() => {
                              setFormUser(user);
                              setFormOpen(true);
                            }}
                            data-cy={`rabbitmq-user-edit-button-${user.name}`}
                          >
                            <PencilIcon className="rmq:w-4 rmq:h-4" />
                          </Button>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            aria-label={`Edit permissions of ${user.name}`}
                            onPress={() => setPermissionsUser(user)}
                            data-cy={`rabbitmq-user-permissions-button-${user.name}`}
                          >
                            <KeyRoundIcon className="rmq:w-4 rmq:h-4" />
                          </Button>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            aria-label={`Delete user ${user.name}`}
                            onPress={() => {
                              setDeleteError(null);
                              setUserToDelete(user);
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
        isOpen={formOpen}
        user={formUser}
        vhosts={data?.vhosts ?? []}
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

      <Modal
        isOpen={userToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setUserToDelete(null);
        }}
        data-cy={`rabbitmq-user-delete-modal-${mqttServerId}`}
      >
        <ModalBackdrop>
          <ModalContainer size="sm">
            <ModalDialog>
              {({ close }) => (
                <>
                  <ModalHeader>
                    <ModalHeading>Delete user</ModalHeading>
                  </ModalHeader>
                  <ModalBody className="rmq:flex rmq:flex-col rmq:gap-3">
                    <p>
                      Delete the RabbitMQ user <strong>{userToDelete?.name}</strong>? Connected clients using this
                      account will be disconnected and its permissions removed.
                    </p>
                    {deleteError && (
                      <Alert status="danger" data-cy="rabbitmq-user-delete-error-alert">
                        <AlertContent>
                          <AlertDescription>{deleteError}</AlertDescription>
                        </AlertContent>
                      </Alert>
                    )}
                  </ModalBody>
                  <ModalFooter>
                    <Button variant="secondary" onPress={close} data-cy="rabbitmq-user-delete-cancel-button">
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      onPress={() => void confirmDelete()}
                      isPending={deleting}
                      data-cy="rabbitmq-user-delete-confirm-button"
                    >
                      Delete
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </Card>
  );
}
