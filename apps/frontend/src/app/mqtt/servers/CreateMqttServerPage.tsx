import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, Card, CardHeader, TextField, Label, Input, Checkbox, Form } from "@heroui/react";
import { Select } from '../../../components/select';
import { ArrowLeft } from 'lucide-react';
import { PasswordInput } from '../../../components/PasswordInput';
import { useNavigate } from 'react-router-dom';
import { useToastMessage } from '../../../components/toastProvider';
import en from './translations/create/en.json';
import de from './translations/create/de.json';
import { useCallback, useState } from 'react';
import {
  useMqttServiceMqttServersCreateOne,
  CreateMqttServerDto,
  useMqttServiceMqttServersGetAllKey,
  MqttServer,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';

interface CreateMqttServerPageProps {
  onSuccess?: (createdServer: MqttServer) => void;
  onCancel?: () => void;
}

export function CreateMqttServerForm(props?: Readonly<CreateMqttServerPageProps>) {
  const { onSuccess } = props || {};
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
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
      if (onSuccess) {
        onSuccess(server);
      } else {
        navigate('/mqtt/servers');
      }
    },
    onError: (err: Error) => {
      toast.error({
        title: t('errorGeneric'),
        description: err.message || t('failedToCreate'),
      });
    },
  });

  const handleCancel = useCallback(() => {
    if (props?.onCancel) {
      props.onCancel();
    } else {
      navigate('/mqtt/servers');
    }
  }, [props, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMqttServer.mutate({ requestBody: formValues });
  };

  const qosOptions = [0, 1, 2] as const;

  return (
    <Form onSubmit={handleSubmit} data-cy="create-mqtt-server-form">
      <TextField value={formValues.name} onChange={(v) => setFormValues((p) => ({ ...p, name: v }))}>
        <Label>{t('nameLabel')}</Label>
        <Input id="name" name="name" placeholder={t('namePlaceholder')} required data-cy="create-mqtt-server-form-name-input" />
      </TextField>

      <TextField value={formValues.host} onChange={(v) => setFormValues((p) => ({ ...p, host: v }))}>
        <Label>{t('hostLabel')}</Label>
        <Input id="host" name="host" placeholder={t('hostPlaceholder')} required data-cy="create-mqtt-server-form-host-input" />
      </TextField>

      <TextField value={String(formValues.port ?? 1883)} onChange={(v) => setFormValues((p) => ({ ...p, port: parseInt(v, 10) }))}>
        <Label>{t('portLabel')}</Label>
        <Input id="port" name="port" type="number" placeholder={t('portPlaceholder')} required data-cy="create-mqtt-server-form-port-input" />
      </TextField>

      <TextField value={formValues.clientId} onChange={(v) => setFormValues((p) => ({ ...p, clientId: v }))}>
        <Label>{t('clientIdLabel')}</Label>
        <Input id="clientId" name="clientId" placeholder={t('clientIdPlaceholder')} data-cy="create-mqtt-server-form-client-id-input" />
      </TextField>

      <TextField value={formValues.username} onChange={(v) => setFormValues((p) => ({ ...p, username: v }))}>
        <Label>{t('usernameLabel')}</Label>
        <Input id="username" name="username" placeholder={t('usernamePlaceholder')} data-cy="create-mqtt-server-form-username-input" />
      </TextField>

      <PasswordInput
        label={t('passwordLabel')}
        id="password"
        name="password"
        placeholder={t('passwordPlaceholder')}
        value={formValues.password}
        onChange={(v: string) => setFormValues((p) => ({ ...p, password: v }))}
        fullWidth
        data-cy="create-mqtt-server-form-password-input"
        autoComplete="off"
      />

      <Checkbox
        id="useTls"
        name="useTls"
        isSelected={formValues.useTls}
        onChange={(checked) => setFormValues((prev) => ({ ...prev, useTls: checked }))}
        data-cy="create-mqtt-server-form-use-tls-checkbox"
      >
        {t('useTls')}
      </Checkbox>

      <Select
        label={t('defaultPublishQosLabel')}
        value={String(formValues.defaultPublishQos ?? 0)}
        onChange={(key) => setFormValues((prev) => ({ ...prev, defaultPublishQos: Number(key) }))}
        data-cy="create-mqtt-server-form-default-publish-qos-input"
        items={qosOptions.map((option) => ({ key: String(option), label: t(`qosOption.${option}`) }))}
      />

      <Checkbox
        id="defaultPublishRetain"
        name="defaultPublishRetain"
        isSelected={!!formValues.defaultPublishRetain}
        onChange={(checked) => setFormValues((prev) => ({ ...prev, defaultPublishRetain: checked }))}
        data-cy="create-mqtt-server-form-default-publish-retain-checkbox"
      >
        {t('defaultPublishRetainLabel')}
      </Checkbox>

      <Select
        label={t('defaultSubscribeQosLabel')}
        value={String(formValues.defaultSubscribeQos ?? 0)}
        onChange={(key) => setFormValues((prev) => ({ ...prev, defaultSubscribeQos: Number(key) }))}
        data-cy="create-mqtt-server-form-default-subscribe-qos-input"
        items={qosOptions.map((option) => ({ key: String(option), label: t(`qosOption.${option}`) }))}
      />

      <div className="flex justify-end space-x-3 mt-4">
        <Button variant="secondary" onPress={handleCancel} data-cy="create-mqtt-server-form-cancel-button">
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

export function CreateMqttServerPage(props?: Readonly<CreateMqttServerPageProps>) {
  const navigate = useNavigate();

  const { t } = useTranslations({ en, de });

  const handleCancel = useCallback(() => {
    if (props?.onCancel) {
      props.onCancel();
    } else {
      navigate('/mqtt/servers');
    }
  }, [props, navigate]);

  return (
    <Card data-cy="create-mqtt-server-page-card">
      <CardHeader>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Button variant="ghost"
              isIconOnly
              onPress={handleCancel}
              aria-label={t('back')}
              data-cy="create-mqtt-server-page-back-button"
            >
              <ArrowLeft size={20} />
            </Button>
            <h2>{t('addNewMqttServer')}</h2>
          </div>
        </div>
      </CardHeader>
      <div style={{ padding: '1rem' }}>
        <CreateMqttServerForm {...props} onCancel={handleCancel} />
      </div>
    </Card>
  );
}
