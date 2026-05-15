import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, Checkbox, Form, Input, Label, Spinner, TextField } from '@heroui/react';
import { Select } from '../../../components/select';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { PageHeader } from '../../../components/pageHeader';
import { PasswordInput } from '../../../components/PasswordInput';
import { useNavigate, useParams } from 'react-router-dom';
import { useToastMessage } from '../../../components/toastProvider';
import en from './translations/edit/en.json';
import de from './translations/edit/de.json';
import { useState, useEffect } from 'react';
import {
  useMqttServiceMqttServersUpdateOne,
  useMqttServiceMqttServersGetOneById,
  CreateMqttServerDto,
  useMqttServiceMqttServersGetAllKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';

export function EditMqttServerPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();

  const [formValues, setFormValues] = useState<CreateMqttServerDto>({
    name: '',
    host: '',
    port: 1883,
    clientId: '',
    username: '',
    password: '',
    useTls: false,
    defaultPublishQos: 0,
    defaultPublishRetain: false,
    defaultSubscribeQos: 0,
  });

  const {
    data: server,
    isLoading: isLoadingServer,
    isError,
  } = useMqttServiceMqttServersGetOneById({ id: Number(serverId) });

  useEffect(() => {
    if (server) {
      setFormValues({
        name: server.name,
        host: server.host,
        port: server.port,
        clientId: server.clientId ?? '',
        username: server.username ?? '',
        password: server.password ?? '',
        useTls: server.useTls,
        defaultPublishQos: server.defaultPublishQos ?? 0,
        defaultPublishRetain: server.defaultPublishRetain ?? false,
        defaultSubscribeQos: server.defaultSubscribeQos ?? 0,
      });
    }
  }, [server]);

  const updateMqttServer = useMqttServiceMqttServersUpdateOne({
    onSuccess: () => {
      success({
        title: t('serverUpdated'),
        description: t('serverUpdatedDesc'),
      });
      queryClient.invalidateQueries({
        queryKey: [useMqttServiceMqttServersGetAllKey],
      });
      navigate('/mqtt/servers');
    },
    onError: (err: Error) => {
      showError({
        title: t('errorGeneric'),
        description: err.message || t('failedToUpdate'),
      });
    },
  });

  const qosOptions = [0, 1, 2] as const;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverId) return;

    updateMqttServer.mutate({
      id: Number(serverId),
      requestBody: formValues,
    });
  };

  const handleCancel = () => {
    navigate('/mqtt/servers');
  };

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
    <div className="max-w-7xl mx-auto px-4 py-8" data-cy="edit-mqtt-server-page">
      <PageHeader title={t('editMqttServer')} onBack={handleCancel} />

      <Form onSubmit={handleSubmit} className="gap-8" data-cy="edit-mqtt-server-form">
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
              data-cy="edit-mqtt-server-form-name-input"
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
                data-cy="edit-mqtt-server-form-host-input"
              />
            </TextField>

            <TextField
              value={String(formValues.port || 1883)}
              onChange={(v) => setFormValues((p) => ({ ...p, port: parseInt(v, 10) }))}
            >
              <Label>{t('portLabel')}</Label>
              <Input
                id="port"
                name="port"
                type="number"
                placeholder={t('portPlaceholder')}
                required
                data-cy="edit-mqtt-server-form-port-input"
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
              data-cy="edit-mqtt-server-form-client-id-input"
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
                data-cy="edit-mqtt-server-form-username-input"
              />
            </TextField>

            <PasswordInput
              label={t('passwordLabel')}
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
            id="useTls"
            name="useTls"
            isSelected={formValues.useTls}
            onChange={(checked) => setFormValues((prev) => ({ ...prev, useTls: checked }))}
            data-cy="edit-mqtt-server-form-use-tls-checkbox"
          >
            {t('useTls')}
          </Checkbox>
        </section>

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
    </div>
  );
}
