import { Description, FieldError, Form, Input, Label, TextField } from '@heroui/react';
import { TlsSection } from './TlsSection';
import { Button } from '../../../components/button/index';
import { Select } from '../../../components/select/index';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { PasswordInput } from '../../../components/PasswordInput/index';
import {
  MqttServer,
  useMqttServiceMqttServersCreateOne,
  CreateMqttServerDto,
  useMqttServiceMqttServersGetAllKey,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MqttManagementPort, parseManagementPort } from './managementPort';
import { useToastMessage } from '../../../components/toastProvider';
import en from './translations/create/en.json';
import de from './translations/create/de.json';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useCreateMqttServerFormState(props?: Readonly<CreateMqttServerFormProps>) {
  const { onSuccess, onCancel } = props || {};
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const [managementPortInput, setManagementPortInput] = useState('');
  const managementPort = parseManagementPort(managementPortInput);

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
    if (managementPort === undefined) return;
    const requestBody: CreateMqttServerDto & MqttManagementPort = { ...formValues, managementPort };
    createMqttServer.mutate({ requestBody });
  };

  const qosOptions = [0, 1, 2] as const;
  return {
    onCancel,
    t,
    managementPortInput,
    setManagementPortInput,
    managementPort,
    formValues,
    setFormValues,
    createMqttServer,
    handleSubmit,
    qosOptions,
  } as const;
}

export interface CreateMqttServerFormProps {
  onSuccess?: (createdServer: MqttServer) => void;
  onCancel?: () => void;
}

export function CreateMqttServerForm(props?: Readonly<CreateMqttServerFormProps>) {
  const model = useCreateMqttServerFormState(props);

  return (
    <Form onSubmit={model.handleSubmit} className="gap-8" data-cy="create-mqtt-server-form">
      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {model.t('sections.connection')}
        </h3>
        <TextField
          value={model.formValues.name}
          onChange={(v) => model.setFormValues((p) => ({ ...p, name: v }))}
          className="w-full"
        >
          <Label>{model.t('nameLabel')}</Label>
          <Input
            id="name"
            name="name"
            placeholder={model.t('namePlaceholder')}
            required
            data-cy="create-mqtt-server-form-name-input"
          />
        </TextField>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          <TextField
            value={model.formValues.host}
            onChange={(v) => model.setFormValues((p) => ({ ...p, host: v }))}
            className="md:col-span-2"
          >
            <Label>{model.t('hostLabel')}</Label>
            <Input
              id="host"
              name="host"
              placeholder={model.t('hostPlaceholder')}
              required
              data-cy="create-mqtt-server-form-host-input"
            />
          </TextField>

          <TextField
            value={String(model.formValues.port ?? 1883)}
            onChange={(v) => model.setFormValues((p) => ({ ...p, port: parseInt(v, 10) }))}
          >
            <Label>{model.t('portLabel')}</Label>
            <Input
              id="port"
              name="port"
              type="number"
              placeholder={model.t('portPlaceholder')}
              required
              data-cy="create-mqtt-server-form-port-input"
            />
          </TextField>
        </div>
        <TextField
          value={model.managementPortInput}
          onChange={model.setManagementPortInput}
          isInvalid={model.managementPort === undefined}
          className="w-full"
        >
          <Label>{model.t('managementPortLabel')}</Label>
          <Input
            name="managementPort"
            type="number"
            min={1}
            max={65535}
            step={1}
            data-cy="create-mqtt-server-form-management-port-input"
          />
          <Description>{model.t('managementPortDescription')}</Description>
          <FieldError>{model.t('managementPortInvalid')}</FieldError>
        </TextField>
      </section>

      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {model.t('sections.authentication')}
        </h3>
        <TextField
          value={model.formValues.clientId}
          onChange={(v) => model.setFormValues((p) => ({ ...p, clientId: v }))}
          className="w-full"
        >
          <Label>{model.t('clientIdLabel')}</Label>
          <Input
            id="clientId"
            name="clientId"
            placeholder={model.t('clientIdPlaceholder')}
            data-cy="create-mqtt-server-form-client-id-input"
          />
        </TextField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          <TextField
            value={model.formValues.username}
            onChange={(v) => model.setFormValues((p) => ({ ...p, username: v }))}
          >
            <Label>{model.t('usernameLabel')}</Label>
            <Input
              id="username"
              name="username"
              placeholder={model.t('usernamePlaceholder')}
              data-cy="create-mqtt-server-form-username-input"
            />
          </TextField>

          <PasswordInput
            label={model.t('passwordLabel')}
            id="password"
            name="password"
            placeholder={model.t('passwordPlaceholder')}
            value={model.formValues.password}
            onChange={(v: string) => model.setFormValues((p) => ({ ...p, password: v }))}
            data-cy="create-mqtt-server-form-password-input"
            autoComplete="off"
          />
        </div>
      </section>

      <TlsSection
        values={model.formValues}
        onChange={(patch) => model.setFormValues((prev) => ({ ...prev, ...patch }))}
        t={model.t}
        dataCyPrefix="create-mqtt-server-form"
      />

      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {model.t('sections.publishDefaults')}
        </h3>
        <Select
          label={model.t('defaultPublishQosLabel')}
          value={String(model.formValues.defaultPublishQos ?? 0)}
          onChange={(key) => model.setFormValues((prev) => ({ ...prev, defaultPublishQos: Number(key) }))}
          data-cy="create-mqtt-server-form-default-publish-qos-input"
          items={model.qosOptions.map((option) => ({ key: String(option), label: model.t(`qosOption.${option}`) }))}
        />

        <LabeledSwitch
          id="defaultPublishRetain"
          name="defaultPublishRetain"
          isSelected={!!model.formValues.defaultPublishRetain}
          onChange={(checked) => model.setFormValues((prev) => ({ ...prev, defaultPublishRetain: checked }))}
          data-cy="create-mqtt-server-form-default-publish-retain-checkbox"
        >
          {model.t('defaultPublishRetainLabel')}
        </LabeledSwitch>
      </section>

      <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {model.t('sections.subscribeDefaults')}
        </h3>
        <Select
          label={model.t('defaultSubscribeQosLabel')}
          value={String(model.formValues.defaultSubscribeQos ?? 0)}
          onChange={(key) => model.setFormValues((prev) => ({ ...prev, defaultSubscribeQos: Number(key) }))}
          data-cy="create-mqtt-server-form-default-subscribe-qos-input"
          items={model.qosOptions.map((option) => ({ key: String(option), label: model.t(`qosOption.${option}`) }))}
        />
      </section>

      <div className="flex justify-end space-x-3 mt-4 w-full">
        <Button variant="secondary" onPress={model.onCancel} data-cy="create-mqtt-server-form-cancel-button">
          {model.t('cancel')}
        </Button>
        <Button
          variant="primary"
          type="submit"
          isPending={model.createMqttServer.isPending}
          data-cy="create-mqtt-server-form-create-button"
        >
          {model.t('create')}
        </Button>
      </div>
    </Form>
  );
}
