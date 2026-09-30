// Per-vhost permission editor for one RabbitMQ user (ATT-522).
//
// Shows one editable block per vhost the user has permissions on. Each block
// edits the three RabbitMQ permission regexes (configure / write / read) and
// saves or removes that vhost's permissions individually. A footer row adds
// permissions on another vhost, prefilled with the default MQTT permissions.
import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  Input,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextField,
} from '@heroui/react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_MQTT_PERMISSIONS,
  clearPermissions,
  setPermissions,
  type RabbitmqPermission,
  type RabbitmqUser,
} from './users-api';

export interface RabbitmqPermissionsModalProps {
  mqttServerId: number;
  isOpen: boolean;
  user: RabbitmqUser | null;
  vhosts: string[];
  onClose: () => void;
  // Called after every successful change so the panel reflects the broker.
  onSaved: () => void;
}

interface PermissionRow extends RabbitmqPermission {
  // Rows added via "Add vhost" don't exist on the broker until saved — their
  // remove button only drops the row locally.
  persisted: boolean;
}

function PermissionEditor({
  row,
  busy,
  onChange,
  onSave,
  onRemove,
}: {
  row: PermissionRow;
  busy: boolean;
  onChange: (next: PermissionRow) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="rmq:flex rmq:flex-col rmq:gap-3 rmq:rounded-lg rmq:border rmq:border-default-200 rmq:dark:border-default-100 rmq:p-3"
      data-cy={`rabbitmq-permissions-row-${row.vhost}`}
    >
      <div className="rmq:flex rmq:items-center rmq:justify-between rmq:gap-2">
        <span className="rmq:text-sm rmq:font-semibold rmq:text-default-700">
          Vhost <code>{row.vhost}</code>
        </span>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={`Remove permissions on ${row.vhost}`}
          onPress={onRemove}
          isDisabled={busy}
          data-cy={`rabbitmq-permissions-remove-button-${row.vhost}`}
        >
          <Trash2Icon className="rmq:w-4 rmq:h-4 rmq:text-danger" />
        </Button>
      </div>

      <div className="rmq:grid rmq:grid-cols-1 rmq:md:grid-cols-3 rmq:gap-3">
        <TextField value={row.configure} onChange={(v) => onChange({ ...row, configure: v })}>
          <Label>Configure</Label>
          <Input autoComplete="off" data-cy={`rabbitmq-permissions-configure-input-${row.vhost}`} />
        </TextField>
        <TextField value={row.write} onChange={(v) => onChange({ ...row, write: v })}>
          <Label>Write</Label>
          <Input autoComplete="off" data-cy={`rabbitmq-permissions-write-input-${row.vhost}`} />
        </TextField>
        <TextField value={row.read} onChange={(v) => onChange({ ...row, read: v })}>
          <Label>Read</Label>
          <Input autoComplete="off" data-cy={`rabbitmq-permissions-read-input-${row.vhost}`} />
        </TextField>
      </div>

      <div className="rmq:flex rmq:justify-end rmq:gap-2">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => onChange({ ...row, ...DEFAULT_MQTT_PERMISSIONS })}
          isDisabled={busy}
          data-cy={`rabbitmq-permissions-mqtt-defaults-button-${row.vhost}`}
        >
          Use MQTT defaults
        </Button>
        <Button
          size="sm"
          variant="primary"
          onPress={onSave}
          isPending={busy}
          data-cy={`rabbitmq-permissions-save-button-${row.vhost}`}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

export function RabbitmqPermissionsModal({
  mqttServerId,
  isOpen,
  user,
  vhosts,
  onClose,
  onSaved,
}: RabbitmqPermissionsModalProps) {
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [newVhost, setNewVhost] = useState('');
  const [busyVhost, setBusyVhost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-seed from the user whenever the modal opens.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setRows((user?.permissions ?? []).map((permission) => ({ ...permission, persisted: true })));
    setNewVhost('');
    setBusyVhost(null);
    setError(null);
  }, [isOpen, user]);

  if (!user) {
    return null;
  }

  const updateRow = (index: number, next: PermissionRow) => {
    setRows((current) => current.map((row, i) => (i === index ? next : row)));
  };

  const saveRow = async (index: number) => {
    const row = rows[index];
    setBusyVhost(row.vhost);
    setError(null);
    try {
      await setPermissions(mqttServerId, user.name, {
        vhost: row.vhost,
        configure: row.configure,
        write: row.write,
        read: row.read,
      });
      updateRow(index, { ...row, persisted: true });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving permissions failed.');
    } finally {
      setBusyVhost(null);
    }
  };

  const removeRow = async (index: number) => {
    const row = rows[index];
    if (!row.persisted) {
      setRows((current) => current.filter((_, i) => i !== index));
      return;
    }
    setBusyVhost(row.vhost);
    setError(null);
    try {
      await clearPermissions(mqttServerId, user.name, row.vhost);
      setRows((current) => current.filter((_, i) => i !== index));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Removing permissions failed.');
    } finally {
      setBusyVhost(null);
    }
  };

  const addVhost = () => {
    const vhost = newVhost.trim();
    if (vhost.length === 0) {
      return;
    }
    if (rows.some((row) => row.vhost === vhost)) {
      setError(`Permissions for vhost "${vhost}" are already listed.`);
      return;
    }
    setRows((current) => [...current, { vhost, persisted: false, ...DEFAULT_MQTT_PERMISSIONS }]);
    setNewVhost('');
    setError(null);
  };

  const unusedVhosts = vhosts.filter((vhost) => !rows.some((row) => row.vhost === vhost));

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-cy={`rabbitmq-permissions-modal-${mqttServerId}`}
    >
      <ModalBackdrop>
        <ModalContainer size="lg">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading>Permissions of "{user.name}"</ModalHeading>
            </ModalHeader>
            <ModalBody className="rmq:flex rmq:flex-col rmq:gap-4 rmq:w-full">
              {rows.length === 0 && (
                <p className="rmq:text-sm rmq:text-default-500" data-cy="rabbitmq-permissions-empty">
                  This user has no permissions on any vhost — it cannot connect yet.
                </p>
              )}

              {rows.map((row, index) => (
                <PermissionEditor
                  key={row.vhost}
                  row={row}
                  busy={busyVhost === row.vhost}
                  onChange={(next) => updateRow(index, next)}
                  onSave={() => saveRow(index)}
                  onRemove={() => removeRow(index)}
                />
              ))}

              <div className="rmq:flex rmq:items-end rmq:gap-2">
                <TextField value={newVhost} onChange={setNewVhost} className="rmq:flex-1">
                  <Label>Add vhost{unusedVhosts.length > 0 ? ` (available: ${unusedVhosts.join(', ')})` : ''}</Label>
                  <Input placeholder="/" autoComplete="off" data-cy="rabbitmq-permissions-add-vhost-input" />
                </TextField>
                <Button
                  variant="secondary"
                  onPress={addVhost}
                  isDisabled={newVhost.trim().length === 0}
                  data-cy="rabbitmq-permissions-add-vhost-button"
                >
                  <PlusIcon className="rmq:w-4 rmq:h-4" />
                  Add
                </Button>
              </div>

              {error && (
                <Alert status="danger" data-cy="rabbitmq-permissions-error-alert">
                  <AlertContent>
                    <AlertDescription>{error}</AlertDescription>
                  </AlertContent>
                </Alert>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onPress={onClose} data-cy="rabbitmq-permissions-close-button">
                Close
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
