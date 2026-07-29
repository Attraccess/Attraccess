import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Form, Input, Label, TextField } from '@heroui/react';
import { TlsSection } from './TlsSection';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { PasswordInput } from '../../../components/PasswordInput';
import { useToastMessage } from '../../../components/toastProvider';
import en from './translations/create/en.json';
import de from './translations/create/de.json';
import { useState } from 'react';
import {
  useMqttServiceMqttServersCreateOne,
  CreateMqttServerDto,
  useMqttServiceMqttServersGetAllKey,
  MqttServer,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';

interface CreateMqttServerFormProps {
  onSuccess?: (createdServer: MqttServer) => void;
  onCancel?: () => void;
}

export function CreateMqttServerForm(props?: Readonly<CreateMqttServerFormProps>) {
  const { onSuccess, onCancel } = props || {};
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [formValues, setFormValues] = useState<CreateMqttServerDto>({
    name: '',
    host: '',
    port: 1883,
    clientId: '',
    username: '',
    password: '',
    useTls: false,
    caCert: '',
    tlsInsecure: false,
    tlsServername: '',
    defaultPublishQos: 0,
    defaultPublishRetain: false,
    defaultSubscribeQos: 0,
  });

  const createMqttServer = useMqttServiceMqttServersCreateOne({
    onSuccess: (server) => {
      toast.success({
        title: t('serverCreated'),
        description: t('serverCreatedDesc'),
      });
      queryClient.invalidateQueries({
        queryKey: [useMqttServiceMqttServersGetAllKey],
      });
      onSuccess?.(server);
    },
    onError: (err: Error) => {
      toast.error({
        title: t('errorGeneric'),
        description: err.message || t('failedToCreate'),
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMqttServer.mutate({ requestBody: formValues });
  };

  const qosOptions = [0, 1, 2] as const;

  return (
    <Form onSubmit={handleSubmit} className="gap-8" data-cy="create-mqtt-server-form">
      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('sections.connection')}
        </h3>
        <TextField
          value={formValues.name}
          onChange={(v) => setFormValues((p) => ({ ...p, name: v }))}
          className="w-full"
        >
          <Label>{t('nameLabel')}</Label>
          <Input
            id="name"
            name="name"
            placeholder={t('namePlaceholder')}
            required
            data-cy="create-mqtt-server-form-name-input"
          />
        </TextField>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          <TextField
            value={formValues.host}
            onChange={(v) => setFormValues((p) => ({ ...p, host: v }))}
            className="md:col-span-2"
          >
            <Label>{t('hostLabel')}</Label>
            <Input
              id="host"
              name="host"
              placeholder={t('hostPlaceholder')}
              required
              data-cy="create-mqtt-server-form-host-input"
            />
          </TextField>

          <TextField
            value={String(formValues.port ?? 1883)}
            onChange={(v) => setFormValues((p) => ({ ...p, port: parseInt(v, 10) }))}
          >
            <Label>{t('portLabel')}</Label>
            <Input
              id="port"
              name="port"
              type="number"
              placeholder={t('portPlaceholder')}
              required
              data-cy="create-mqtt-server-form-port-input"
            />
          </TextField>
        </div>
      </section>

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
            data-cy="create-mqtt-server-form-client-id-input"
          />
        </TextField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          <TextField
            value={formValues.username}
            onChange={(v) => setFormValues((p) => ({ ...p, username: v }))}
          >
            <Label>{t('usernameLabel')}</Label>
            <Input
              id="username"
              name="username"
              placeholder={t('usernamePlaceholder')}
              data-cy="create-mqtt-server-form-username-input"
            />
          </TextField>

          <PasswordInput
            label={t('passwordLabel')}
            id="password"
            name="password"
            placeholder={t('passwordPlaceholder')}
            value={formValues.password}
            onChange={(v: string) => setFormValues((p) => ({ ...p, password: v }))}
            data-cy="create-mqtt-server-form-password-input"
            autoComplete="off"
          />
        </div>

      </section>

      <TlsSection
        values={formValues}
        onChange={(patch) => setFormValues((prev) => ({ ...prev, ...patch }))}
        t={t}
        dataCyPrefix="create-mqtt-server-form"
      />

      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('sections.publishDefaults')}
        </h3>
        <Select
          label={t('defaultPublishQosLabel')}
          value={String(formValues.defaultPublishQos ?? 0)}
          onChange={(key) => setFormValues((prev) => ({ ...prev, defaultPublishQos: Number(key) }))}
          data-cy="create-mqtt-server-form-default-publish-qos-input"
          items={qosOptions.map((option) => ({ key: String(option), label: t(`qosOption.${option}`) }))}
        />

        <LabeledSwitch
          id="defaultPublishRetain"
          name="defaultPublishRetain"
          isSelected={!!formValues.defaultPublishRetain}
          onChange={(checked) => setFormValues((prev) => ({ ...prev, defaultPublishRetain: checked }))}
          data-cy="create-mqtt-server-form-default-publish-retain-checkbox"
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
          onChange={(key) => setFormValues((prev) => ({ ...prev, defaultSubscribeQos: Number(key) }))}
          data-cy="create-mqtt-server-form-default-subscribe-qos-input"
          items={qosOptions.map((option) => ({ key: String(option), label: t(`qosOption.${option}`) }))}
        />
      </section>

      <div className="flex justify-end space-x-3 mt-4 w-full">
        <Button variant="secondary" onPress={onCancel} data-cy="create-mqtt-server-form-cancel-button">
          {t('cancel')}
        </Button>
        <Button variant="primary"
          type="submit"
          isPending={createMqttServer.isPending}
          data-cy="create-mqtt-server-form-create-button"
        >
          {t('create')}
        </Button>
      </div>
    </Form>
  );
}
