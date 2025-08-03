import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, Card, CardHeader, Input, Checkbox, Form } from '@heroui/react';
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
  UseMqttServiceMqttServersGetAllKeyFn,
  MqttServer,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';

interface CreateMqttServerPageProps {
  onSuccess?: (createdServer: MqttServer) => void;
  onCancel?: () => void;
}

export function CreateMqttServerForm(props?: Readonly<CreateMqttServerPageProps>) {
  const { onSuccess } = props || {};
  const { t } = useTranslations('mqttServerCreate', { en, de });
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
  });

  const createMqttServer = useMqttServiceMqttServersCreateOne({
    onSuccess: (server) => {
      success({
        title: t('serverCreated'),
        description: t('serverCreatedDesc'),
      });
      queryClient.invalidateQueries({
        queryKey: [UseMqttServiceMqttServersGetAllKeyFn()[0]],
      });
      if (onSuccess) {
        onSuccess(server);
      } else {
        navigate('/mqtt/servers');
      }
    },
    onError: (err: Error) => {
      showError({
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const valueAsNumber = type === 'number' ? parseInt(value, 10) : value;
    const newValue = type === 'checkbox' ? checked : valueAsNumber;

    setFormValues((prev) => ({
      ...prev,
      [name]: newValue,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMqttServer.mutate({ requestBody: formValues });
  };

  return (
    <Form onSubmit={handleSubmit} data-cy="create-mqtt-server-form">
      <Input
        id="name"
        name="name"
        label={t('nameLabel')}
        placeholder={t('namePlaceholder')}
        value={formValues.name}
        onChange={handleInputChange}
        required
        fullWidth
        data-cy="create-mqtt-server-form-name-input"
      />

      <Input
        label={t('hostLabel')}
        id="host"
        name="host"
        placeholder={t('hostPlaceholder')}
        value={formValues.host}
        onChange={handleInputChange}
        required
        fullWidth
        data-cy="create-mqtt-server-form-host-input"
      />

      <Input
        label={t('portLabel')}
        id="port"
        name="port"
        type="number"
        placeholder={t('portPlaceholder')}
        value={String(formValues.port ?? 1883)}
        onChange={handleInputChange}
        required
        fullWidth
        data-cy="create-mqtt-server-form-port-input"
      />

      <Input
        label={t('clientIdLabel')}
        id="clientId"
        name="clientId"
        placeholder={t('clientIdPlaceholder')}
        value={formValues.clientId}
        onChange={handleInputChange}
        fullWidth
        data-cy="create-mqtt-server-form-client-id-input"
      />

      <Input
        label={t('usernameLabel')}
        id="username"
        name="username"
        placeholder={t('usernamePlaceholder')}
        value={formValues.username}
        onChange={handleInputChange}
        fullWidth
        data-cy="create-mqtt-server-form-username-input"
      />

      <PasswordInput
        label={t('passwordLabel')}
        id="password"
        name="password"
        placeholder={t('passwordPlaceholder')}
        value={formValues.password}
        onChange={handleInputChange}
        fullWidth
        data-cy="create-mqtt-server-form-password-input"
        autoComplete="off"
      />

      <Checkbox
        id="useTls"
        name="useTls"
        isSelected={formValues.useTls}
        onValueChange={(checked) => setFormValues((prev) => ({ ...prev, useTls: checked }))}
        data-cy="create-mqtt-server-form-use-tls-checkbox"
      >
        {t('useTls')}
      </Checkbox>

      <div className="flex justify-end space-x-3 mt-4">
        <Button color="default" variant="flat" onPress={handleCancel} data-cy="create-mqtt-server-form-cancel-button">
          {t('cancel')}
        </Button>
        <Button
          color="primary"
          type="submit"
          isLoading={createMqttServer.isPending}
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

  const { t } = useTranslations('mqttServerCreatePage', { en, de });

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
            <Button
              isIconOnly
              variant="light"
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
