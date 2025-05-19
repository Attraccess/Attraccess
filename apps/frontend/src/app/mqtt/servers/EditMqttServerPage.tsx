import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, Card, CardHeader, Input, Checkbox, Spinner } from '@heroui/react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToastMessage } from '../../../components/toastProvider';
import en from './translations/edit/en.json';
import de from './translations/edit/de.json';
import { useState, useEffect } from 'react';
import {
  useMqttServersServiceUpdateOneMqttServer,
  useMqttServersServiceGetOneMqttServerById,
  UpdateMqttServerDto,
  UseMqttServersServiceGetAllMqttServersKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';

export function EditMqttServerPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const { t } = useTranslations('mqttServerEdit', { en, de });
  const navigate = useNavigate();
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();

  const [formValues, setFormValues] = useState<UpdateMqttServerDto>({
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
  } = useMqttServersServiceGetOneMqttServerById({ id: Number(serverId) });

  // Update form values when server data is loaded
  useEffect(() => {
    if (server) {
      setFormValues({
        name: server.name,
        host: server.host,
        port: server.port,
        clientId: server.clientId || '',
        username: server.username || '',
        password: server.password || '',
        useTls: server.useTls,
      });
    }
  }, [server]);

  const updateMqttServer = useMqttServersServiceUpdateOneMqttServer({
    onSuccess: () => {
      success({
        title: t('serverUpdated'),
        description: t('serverUpdatedDesc'),
      });
      queryClient.invalidateQueries({
        queryKey: [UseMqttServersServiceGetAllMqttServersKeyFn()[0]],
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
        <Spinner size="lg" color="primary" />
      </div>
    );
  }

  if (isError || !server) {
    return null; // Navigate happens in onError callback
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Button isIconOnly variant="light" onPress={handleCancel} aria-label={t('back')}>
                <ArrowLeft size={20} />
              </Button>
              <h2>{t('editMqttServer')}</h2>
            </div>
          </div>
        </CardHeader>
        <div style={{ padding: '1rem' }}>
          <form onSubmit={handleSubmit} className="space-y-6">
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
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1">
                  {t('passwordLabel')}
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder={t('passwordPlaceholder')}
                  value={formValues.password}
                  onChange={handleInputChange}
                  fullWidth
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useTls"
                  name="useTls"
                  isSelected={formValues.useTls}
                  onValueChange={(checked) => setFormValues((prev) => ({ ...prev, useTls: checked }))}
                />
                <label htmlFor="useTls" className="text-sm">
                  {t('useTls')}
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <Button color="default" variant="flat" onPress={handleCancel}>
                {t('cancel')}
              </Button>
              <Button color="primary" type="submit" isLoading={updateMqttServer.isPending}>
                {t('update')}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
