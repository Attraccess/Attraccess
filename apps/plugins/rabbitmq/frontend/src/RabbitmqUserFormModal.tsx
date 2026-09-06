// Create / edit form for one RabbitMQ user (ATT-522).
//
// Create mode (user == null): username + password are required, and the form
// offers to grant the default MQTT permissions on a chosen vhost so a freshly
// created user can immediately connect over MQTT.
// Edit mode: the username is fixed, the password is optional (blank keeps the
// current one) and tags can be changed. Permissions are edited in their own
// modal (RabbitmqPermissionsModal).
import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  Checkbox,
  Form,
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
import { useEffect, useState } from 'react';
import { DEFAULT_MQTT_PERMISSIONS, upsertUser, type RabbitmqUser, type UpsertRabbitmqUserBody } from './users-api';

export interface RabbitmqUserFormModalProps {
  mqttServerId: number;
  isOpen: boolean;
  // The user being edited; null means create.
  user: RabbitmqUser | null;
  // Known vhosts, used as a hint for the default-permissions vhost field.
  vhosts: string[];
  onClose: () => void;
  // Called after a successful save so the panel can reload the list.
  onSaved: () => void;
}

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function RabbitmqUserFormModal({
  mqttServerId,
  isOpen,
  user,
  vhosts,
  onClose,
  onSaved,
}: RabbitmqUserFormModalProps) {
  const isEdit = user !== null;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tags, setTags] = useState('');
  const [grantMqttDefaults, setGrantMqttDefaults] = useState(true);
  const [vhost, setVhost] = useState('/');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever it opens (for another user, or again after a
  // cancel) — modal state outlives a single open/close cycle.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setUsername(user?.name ?? '');
    setPassword('');
    setTags(user?.tags.join(', ') ?? '');
    setGrantMqttDefaults(true);
    setVhost(vhosts.includes('/') || vhosts.length === 0 ? '/' : vhosts[0]);
    setError(null);
  }, [isOpen, user, vhosts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (name.length === 0) {
      setError('Username is required.');
      return;
    }
    if (!isEdit && password.length === 0) {
      setError('Password is required when creating a user.');
      return;
    }

    const body: UpsertRabbitmqUserBody = { tags: parseTags(tags) };
    if (password.length > 0) {
      body.password = password;
    }
    if (!isEdit && grantMqttDefaults && vhost.trim().length > 0) {
      body.permissions = [{ vhost: vhost.trim(), ...DEFAULT_MQTT_PERMISSIONS }];
    }

    setSaving(true);
    setError(null);
    try {
      await upsertUser(mqttServerId, name, body);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving the user failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-cy={`rabbitmq-user-form-modal-${mqttServerId}`}
    >
      <ModalBackdrop>
        <ModalContainer size="md">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading>{isEdit ? `Edit user "${user.name}"` : 'Create RabbitMQ user'}</ModalHeading>
            </ModalHeader>
            <Form onSubmit={handleSubmit}>
              <ModalBody className="rmq:flex rmq:flex-col rmq:gap-4 rmq:w-full">
                <TextField value={username} onChange={setUsername} className="rmq:w-full" isDisabled={isEdit}>
                  <Label>Username</Label>
                  <Input
                    name="rabbitmq-username"
                    placeholder="e.g. shop-floor-sensor"
                    autoComplete="off"
                    data-cy="rabbitmq-user-form-username-input"
                  />
                </TextField>

                <TextField value={password} onChange={setPassword} className="rmq:w-full">
                  <Label>{isEdit ? 'New password (leave blank to keep current)' : 'Password'}</Label>
                  <Input
                    name="rabbitmq-password"
                    type="password"
                    autoComplete="new-password"
                    data-cy="rabbitmq-user-form-password-input"
                  />
                </TextField>

                <TextField value={tags} onChange={setTags} className="rmq:w-full">
                  <Label>Tags (comma-separated, e.g. management, administrator)</Label>
                  <Input
                    name="rabbitmq-tags"
                    placeholder="none"
                    autoComplete="off"
                    data-cy="rabbitmq-user-form-tags-input"
                  />
                </TextField>

                {!isEdit && (
                  <div className="rmq:flex rmq:flex-col rmq:gap-3 rmq:rounded-lg rmq:border rmq:border-default-200 rmq:dark:border-default-100 rmq:p-3">
                    <Checkbox
                      isSelected={grantMqttDefaults}
                      onChange={setGrantMqttDefaults}
                      data-cy="rabbitmq-user-form-mqtt-defaults-checkbox"
                    >
                      Grant default MQTT permissions
                    </Checkbox>
                    <p className="rmq:text-xs rmq:text-default-500">
                      Allows the user to publish and subscribe over MQTT: configure{' '}
                      <code>{DEFAULT_MQTT_PERMISSIONS.configure}</code>, write/read{' '}
                      <code>{DEFAULT_MQTT_PERMISSIONS.write}</code>.
                    </p>
                    {grantMqttDefaults && (
                      <TextField value={vhost} onChange={setVhost} className="rmq:w-full">
                        <Label>Vhost{vhosts.length > 0 ? ` (available: ${vhosts.join(', ')})` : ''}</Label>
                        <Input
                          name="rabbitmq-vhost"
                          placeholder="/"
                          autoComplete="off"
                          data-cy="rabbitmq-user-form-vhost-input"
                        />
                      </TextField>
                    )}
                  </div>
                )}

                {error && (
                  <Alert status="danger" data-cy="rabbitmq-user-form-error-alert">
                    <AlertContent>
                      <AlertDescription>{error}</AlertDescription>
                    </AlertContent>
                  </Alert>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" onPress={onClose} data-cy="rabbitmq-user-form-cancel-button">
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isPending={saving} data-cy="rabbitmq-user-form-save-button">
                  {isEdit ? 'Save changes' : 'Create user'}
                </Button>
              </ModalFooter>
            </Form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
