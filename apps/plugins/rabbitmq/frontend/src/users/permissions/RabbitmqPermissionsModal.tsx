import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';
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
import { useRabbitmqTranslations } from '../../i18n';
import type { RabbitmqPermission, RabbitmqUser } from '../users-api';
import { DEFAULT_MQTT_PERMISSIONS, clearPermissions, setPermissions } from '../users-api';

export interface PermissionRow extends RabbitmqPermission {
  // Rows added via "Add vhost" don't exist on the broker until saved — their
  // remove button only drops the row locally.
  persisted: boolean;
}

export interface RabbitmqPermissionsModalProps {
  mqttServerId: number;
  isOpen: boolean;
  user: RabbitmqUser | null;
  vhosts: string[];
  onClose: () => void;
  // Called after every successful change so the panel reflects the broker.
  onSaved: () => void;
}

export function PermissionEditor({
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
  const { t } = useRabbitmqTranslations();
  return (
    <div
      className="rmq:flex rmq:flex-col rmq:gap-3 rmq:rounded-lg rmq:border rmq:border-default-200 rmq:dark:border-default-100 rmq:p-3"
      data-cy={`rabbitmq-permissions-row-${row.vhost}`}
    >
      <div className="rmq:flex rmq:items-center rmq:justify-between rmq:gap-2">
        <span className="rmq:text-sm rmq:font-semibold rmq:text-default-700">
          {t('form.vhost')} <code>{row.vhost}</code>
        </span>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t('permissions.remove', { vhost: row.vhost })}
          onPress={onRemove}
          isDisabled={busy}
          data-cy={`rabbitmq-permissions-remove-button-${row.vhost}`}
        >
          <Trash2Icon className="rmq:w-4 rmq:h-4 rmq:text-danger" />
        </Button>
      </div>

      <div className="rmq:grid rmq:grid-cols-1 rmq:md:grid-cols-3 rmq:gap-3">
        <TextField value={row.configure} onChange={(v) => onChange({ ...row, configure: v })}>
          <Label>{t('permissions.configure')}</Label>
          <Input autoComplete="off" data-cy={`rabbitmq-permissions-configure-input-${row.vhost}`} />
        </TextField>
        <TextField value={row.write} onChange={(v) => onChange({ ...row, write: v })}>
          <Label>{t('permissions.write')}</Label>
          <Input autoComplete="off" data-cy={`rabbitmq-permissions-write-input-${row.vhost}`} />
        </TextField>
        <TextField value={row.read} onChange={(v) => onChange({ ...row, read: v })}>
          <Label>{t('permissions.read')}</Label>
          <Input autoComplete="off" data-cy={`rabbitmq-permissions-read-input-${row.vhost}`} />
        </TextField>
      </div>

      <div className="rmq:flex rmq:flex-wrap rmq:justify-end rmq:gap-2">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => onChange({ ...row, ...DEFAULT_MQTT_PERMISSIONS })}
          isDisabled={busy}
          data-cy={`rabbitmq-permissions-mqtt-defaults-button-${row.vhost}`}
        >
          {t('permissions.defaults')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onPress={onSave}
          isPending={busy}
          data-cy={`rabbitmq-permissions-save-button-${row.vhost}`}
        >
          {t('common.save')}
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
  const { t, tMessage } = useRabbitmqTranslations();
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [newVhost, setNewVhost] = useState('');
  const [busyVhost, setBusyVhost] = useState<string | null>(null);
  const [error, setError] = useState<string | TranslationMessage | null>(null);

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
      setError(err instanceof Error ? err.message : { key: 'permissions.saveError' });
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
      setError(err instanceof Error ? err.message : { key: 'permissions.removeError' });
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
      setError({ key: 'permissions.duplicate', data: { vhost } });
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
              <ModalHeading>{t('permissions.title', { name: user.name })}</ModalHeading>
            </ModalHeader>
            <ModalBody className="rmq:flex rmq:flex-col rmq:gap-4 rmq:w-full">
              {rows.length === 0 && (
                <p className="rmq:text-sm rmq:text-default-500" data-cy="rabbitmq-permissions-empty">
                  {t('permissions.empty')}
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
                  <Label>
                    {t('permissions.addVhost')}
                    {unusedVhosts.length > 0 ? t('form.available', { vhosts: unusedVhosts.join(', ') }) : ''}
                  </Label>
                  <Input placeholder="/" autoComplete="off" data-cy="rabbitmq-permissions-add-vhost-input" />
                </TextField>
                <Button
                  variant="secondary"
                  onPress={addVhost}
                  isDisabled={newVhost.trim().length === 0}
                  data-cy="rabbitmq-permissions-add-vhost-button"
                >
                  <PlusIcon className="rmq:w-4 rmq:h-4" />
                  {t('permissions.add')}
                </Button>
              </div>

              {error && (
                <Alert status="danger" data-cy="rabbitmq-permissions-error-alert">
                  <AlertContent>
                    <AlertDescription>{tMessage(error)}</AlertDescription>
                  </AlertContent>
                </Alert>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onPress={onClose} data-cy="rabbitmq-permissions-close-button">
                {t('common.close')}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
