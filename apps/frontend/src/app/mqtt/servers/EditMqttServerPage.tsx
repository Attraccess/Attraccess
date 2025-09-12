import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, Card, CardHeader, Input, Checkbox, Spinner } from '@heroui/react';
import { ArrowLeft } from 'lucide-react';
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
  UseMqttServiceMqttServersGetAllKeyFn,
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
  });

  // Fetch server details
  const {
    data: server,
    isLoading: isLoadingServer,
    isError,
  } = useMqttServiceMqttServersGetOneById({ id: Number(serverId) });

  // Update form values when server data is loaded
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
        queryKey: [UseMqttServiceMqttServersGetAllKeyFn()[0]],
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : type === 'number' ? parseInt(value, 10) : value;

    setFormValues((prev) => ({
      ...prev,
      [name]: newValue,
    }));
  };

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
        <Spinner size="lg" color="primary" data-cy="edit-mqtt-server-page-loading-spinner" />
      </div>
    );
  }

  if (isError || !server) {
    return null; // Navigate happens in onError callback
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Card data-cy="edit-mqtt-server-page-card">
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Button
                isIconOnly
                variant="light"
                onPress={handleCancel}
                aria-label={t('back')}
                data-cy="edit-mqtt-server-page-back-button"
              >
                <ArrowLeft size={20} />
              </Button>
              <h2>{t('editMqttServer')}</h2>
            </div>
          </div>
        </CardHeader>
        <div style={{ padding: '1rem' }}>
          <form onSubmit={handleSubmit} className="space-y-6" data-cy="edit-mqtt-server-form">
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-1">
                  {t('nameLabel')}
                </label>
                <Input
                  id="name"
                  name="name"
                  placeholder={t('namePlaceholder')}
                  value={formValues.name}
                  onChange={handleInputChange}
                  required
                  fullWidth
                  data-cy="edit-mqtt-server-form-name-input"
                />
              </div>

              <div>
                <label htmlFor="host" className="block text-sm font-medium mb-1">
                  {t('hostLabel')}
                </label>
                <Input
                  id="host"
                  name="host"
                  placeholder={t('hostPlaceholder')}
                  value={formValues.host}
                  onChange={handleInputChange}
                  required
                  fullWidth
                  data-cy="edit-mqtt-server-form-host-input"
                />
              </div>

              <div>
                <label htmlFor="port" className="block text-sm font-medium mb-1">
                  {t('portLabel')}
                </label>
                <Input
                  id="port"
                  name="port"
                  type="number"
                  placeholder={t('portPlaceholder')}
                  value={String(formValues.port || 1883)}
                  onChange={handleInputChange}
                  required
                  fullWidth
                  data-cy="edit-mqtt-server-form-port-input"
                />
              </div>

              <div>
                <label htmlFor="clientId" className="block text-sm font-medium mb-1">
                  {t('clientIdLabel')}
                </label>
                <Input
                  id="clientId"
                  name="clientId"
                  placeholder={t('clientIdPlaceholder')}
                  value={formValues.clientId}
                  onChange={handleInputChange}
                  fullWidth
                  data-cy="edit-mqtt-server-form-client-id-input"
                />
              </div>

              <div>
                <label htmlFor="username" className="block text-sm font-medium mb-1">
                  {t('usernameLabel')}
                </label>
                <Input
                  id="username"
                  name="username"
                  placeholder={t('usernamePlaceholder')}
                  value={formValues.username}
                  onChange={handleInputChange}
                  fullWidth
                  data-cy="edit-mqtt-server-form-username-input"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1">
                  {t('passwordLabel')}
                </label>
                <PasswordInput
                  id="password"
                  name="password"
                  placeholder={t('passwordPlaceholder')}
                  value={formValues.password}
                  onChange={handleInputChange}
                  fullWidth
                  data-cy="edit-mqtt-server-form-password-input"
                  autoComplete="off"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useTls"
                  name="useTls"
                  isSelected={formValues.useTls}
                  onValueChange={(checked) => setFormValues((prev) => ({ ...prev, useTls: checked }))}
                  data-cy="edit-mqtt-server-form-use-tls-checkbox"
                />
                <label htmlFor="useTls" className="text-sm">
                  {t('useTls')}
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                color="default"
                variant="flat"
                onPress={handleCancel}
                data-cy="edit-mqtt-server-form-cancel-button"
              >
                {t('cancel')}
              </Button>
              <Button
                color="primary"
                type="submit"
                isLoading={updateMqttServer.isPending}
                data-cy="edit-mqtt-server-form-update-button"
              >
                {t('update')}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
