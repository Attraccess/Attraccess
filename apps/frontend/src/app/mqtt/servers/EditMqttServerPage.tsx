import { Checkbox, Description, Form, Input, Label, Spinner, TextField } from '@heroui/react';
import { TlsSection } from './TlsSection';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { PageHeader } from '../../../components/pageHeader';
import { PasswordInput } from '../../../components/PasswordInput';
import { PluginSlot } from '../../plugins/PluginSlot';
import { MQTT_SERVER_DETAIL_SLOT, MqttServerSlotContext } from '../mqtt.slots';
import { useEditMqttServerPageState } from './useEditMqttServerPageState';
import { EditMqttServerPageEditMqttServerFormNameInput } from './EditMqttServerPageEditMqttServerFormNameInput';

export function EditMqttServerPage() {
  const {
    t,
    managementPortInput,
    setManagementPortInput,
    clearPassword,
    setClearPassword,
    managementPort,
    formValues,
    setFormValues,
    server,
    isLoadingServer,
    isError,
    updateMqttServer,
    qosOptions,
    handleSubmit,
    handleCancel,
  } = useEditMqttServerPageState();

  if (isLoadingServer) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 flex justify-center">
        <Spinner color="accent" data-cy="edit-mqtt-server-page-loading-spinner" />
      </div>
    );
  }

  if (isError || !server) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col gap-8" data-cy="edit-mqtt-server-page">
      <PageHeader title={t('editMqttServer')} onBack={handleCancel} />

      <Form onSubmit={handleSubmit} className="gap-8" data-cy="edit-mqtt-server-form">
        <EditMqttServerPageEditMqttServerFormNameInput
          {...{ t, formValues, setFormValues, managementPortInput, setManagementPortInput, managementPort }}
        />

        <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
            {t('sections.authentication')}
          </h3>
          <TextField
            value={formValues.clientId}
            onChange={(v) => setFormValues((p) => ({ ...p, clientId: v }))}
            className="w-full"
          >
            <Label>{t('clientIdLabel')}</Label>
            <Input
              id="clientId"
              name="clientId"
              placeholder={t('clientIdPlaceholder')}
              data-cy="edit-mqtt-server-form-client-id-input"
            />
          </TextField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
            <TextField value={formValues.username} onChange={(v) => setFormValues((p) => ({ ...p, username: v }))}>
              <Label>{t('usernameLabel')}</Label>
              <Input
                id="username"
                name="username"
                placeholder={t('usernamePlaceholder')}
                data-cy="edit-mqtt-server-form-username-input"
              />
            </TextField>

            <PasswordInput
              label={t('passwordLabel')}
              description={t('passwordDescription')}
              isDisabled={clearPassword}
              id="password"
              name="password"
              placeholder={t('passwordPlaceholder')}
              value={formValues.password}
              onChange={(v: string) => setFormValues((p) => ({ ...p, password: v }))}
              data-cy="edit-mqtt-server-form-password-input"
              autoComplete="off"
            />
          </div>
          <Checkbox
            isSelected={clearPassword}
            onChange={(selected) => {
              setClearPassword(selected);
              if (selected) setFormValues((prev) => ({ ...prev, password: '' }));
            }}
            data-cy="edit-mqtt-server-form-clear-password-checkbox"
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              {t('clearPasswordLabel')}
            </Checkbox.Content>
            <Description>{t('clearPasswordDescription')}</Description>
          </Checkbox>
        </section>

        <TlsSection
          values={formValues}
          onChange={(patch) => setFormValues((prev) => ({ ...prev, ...patch }))}
          t={t}
          dataCyPrefix="edit-mqtt-server-form"
        />

        <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
            {t('sections.publishDefaults')}
          </h3>
          <Select
            label={t('defaultPublishQosLabel')}
            value={String(formValues.defaultPublishQos ?? 0)}
            onChange={(key) => {
              setFormValues((prev) => ({ ...prev, defaultPublishQos: Number(key) }));
            }}
            data-cy="edit-mqtt-server-form-default-publish-qos-input"
            items={qosOptions.map((option) => ({ key: String(option), label: t(`qosOption.${option}`) }))}
          />

          <LabeledSwitch
            id="defaultPublishRetain"
            name="defaultPublishRetain"
            isSelected={!!formValues.defaultPublishRetain}
            onChange={(checked) => setFormValues((prev) => ({ ...prev, defaultPublishRetain: checked }))}
            data-cy="edit-mqtt-server-form-default-publish-retain-checkbox"
          >
            {t('defaultPublishRetainLabel')}
          </LabeledSwitch>
        </section>

        <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
            {t('sections.subscribeDefaults')}
          </h3>
          <Select
            label={t('defaultSubscribeQosLabel')}
            value={String(formValues.defaultSubscribeQos ?? 0)}
            onChange={(key) => {
              setFormValues((prev) => ({ ...prev, defaultSubscribeQos: Number(key) }));
            }}
            data-cy="edit-mqtt-server-form-default-subscribe-qos-input"
            items={qosOptions.map((option) => ({ key: String(option), label: t(`qosOption.${option}`) }))}
          />
        </section>

        <div className="flex justify-end space-x-3 mt-4 w-full">
          <Button variant="secondary" onPress={handleCancel} data-cy="edit-mqtt-server-form-cancel-button">
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            isPending={updateMqttServer.isPending}
            data-cy="edit-mqtt-server-form-update-button"
          >
            {t('update')}
          </Button>
        </div>
      </Form>

      <PluginSlot<MqttServerSlotContext> slotId={MQTT_SERVER_DETAIL_SLOT} context={{ mqttServerId: server.id }} />
    </div>
  );
}
