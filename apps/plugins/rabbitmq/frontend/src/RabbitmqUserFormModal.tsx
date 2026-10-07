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
import { DEFAULT_MQTT_PERMISSIONS } from './users-api';
import { RabbitmqUserFormModalProps } from './RabbitmqUserFormModal.rabbitmq-user-form-modal-props';
import { useRabbitmqUserFormModalState } from './useRabbitmqUserFormModalState';

export function RabbitmqUserFormModal({
  mqttServerId,
  isOpen,
  user,
  vhosts,
  onClose,
  onSaved,
}: RabbitmqUserFormModalProps) {
  const {
    t,
    tMessage,
    isEdit,
    username,
    setUsername,
    password,
    setPassword,
    tags,
    setTags,
    grantMqttDefaults,
    setGrantMqttDefaults,
    vhost,
    setVhost,
    saving,
    error,
    handleSubmit,
  } = useRabbitmqUserFormModalState({ mqttServerId, isOpen, user, vhosts, onClose, onSaved });

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
              <ModalHeading>{isEdit ? t('form.editTitle', { name: user.name }) : t('form.createTitle')}</ModalHeading>
            </ModalHeader>
            <Form onSubmit={handleSubmit}>
              <ModalBody className="rmq:flex rmq:flex-col rmq:gap-4 rmq:w-full">
                <TextField value={username} onChange={setUsername} className="rmq:w-full" isDisabled={isEdit}>
                  <Label>{t('users.username')}</Label>
                  <Input
                    name="rabbitmq-username"
                    placeholder={t('form.usernamePlaceholder')}
                    autoComplete="off"
                    data-cy="rabbitmq-user-form-username-input"
                  />
                </TextField>

                <TextField value={password} onChange={setPassword} className="rmq:w-full">
                  <Label>{t(isEdit ? 'form.newPassword' : 'form.password')}</Label>
                  <Input
                    name="rabbitmq-password"
                    type="password"
                    autoComplete="new-password"
                    data-cy="rabbitmq-user-form-password-input"
                  />
                </TextField>

                <TextField value={tags} onChange={setTags} className="rmq:w-full">
                  <Label>{t('form.tags')}</Label>
                  <Input
                    name="rabbitmq-tags"
                    placeholder={t('users.none')}
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
                      <Checkbox.Content className="rmq:items-start">
                        <Checkbox.Control className="rmq:mt-0.5">
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        {t('form.grant')}
                      </Checkbox.Content>
                    </Checkbox>
                    <p className="rmq:text-xs rmq:text-default-500">{t('form.defaults', DEFAULT_MQTT_PERMISSIONS)}</p>
                    {grantMqttDefaults && (
                      <TextField value={vhost} onChange={setVhost} className="rmq:w-full">
                        <Label>
                          {t('form.vhost')}
                          {vhosts.length > 0 ? t('form.available', { vhosts: vhosts.join(', ') }) : ''}
                        </Label>
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
                      <AlertDescription>{tMessage(error)}</AlertDescription>
                    </AlertContent>
                  </Alert>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" onPress={onClose} data-cy="rabbitmq-user-form-cancel-button">
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" type="submit" isPending={saving} data-cy="rabbitmq-user-form-save-button">
                  {t(isEdit ? 'form.save' : 'form.create')}
                </Button>
              </ModalFooter>
            </Form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

export { type RabbitmqUserFormModalProps } from './RabbitmqUserFormModal.rabbitmq-user-form-modal-props';
