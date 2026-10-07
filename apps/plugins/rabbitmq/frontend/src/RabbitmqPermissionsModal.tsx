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
import { PlusIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_MQTT_PERMISSIONS, clearPermissions, setPermissions } from './users-api';
import { useRabbitmqTranslations } from './i18n';
import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';
import { RabbitmqPermissionsModalProps } from './RabbitmqPermissionsModal.contracts';
import { PermissionRow } from './RabbitmqPermissionsModal.contracts';
import { PermissionEditor } from './RabbitmqPermissionsModal.permission-editor';

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

export { type RabbitmqPermissionsModalProps } from './RabbitmqPermissionsModal.contracts';
