import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, Card, CardHeader, TextField, Label, Input, Checkbox, ListBoxItem, Spinner, Switch, Select } from "@heroui/react";
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
    return null; // Navigate happens in onError callback
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Card data-cy="edit-mqtt-server-page-card">
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Button variant="ghost"
                isIconOnly
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
              <TextField value={formValues.name} onChange={(v) => setFormValues((p) => ({ ...p, name: v }))}>
                <Label>{t('nameLabel')}</Label>
                <Input id="name" name="name" placeholder={t('namePlaceholder')} required data-cy="edit-mqtt-server-form-name-input" />
              </TextField>

              <TextField value={formValues.host} onChange={(v) => setFormValues((p) => ({ ...p, host: v }))}>
                <Label>{t('hostLabel')}</Label>
                <Input id="host" name="host" placeholder={t('hostPlaceholder')} required data-cy="edit-mqtt-server-form-host-input" />
              </TextField>

              <TextField value={String(formValues.port || 1883)} onChange={(v) => setFormValues((p) => ({ ...p, port: parseInt(v, 10) }))}>
                <Label>{t('portLabel')}</Label>
                <Input id="port" name="port" type="number" placeholder={t('portPlaceholder')} required data-cy="edit-mqtt-server-form-port-input" />
              </TextField>

              <TextField value={formValues.clientId} onChange={(v) => setFormValues((p) => ({ ...p, clientId: v }))}>
                <Label>{t('clientIdLabel')}</Label>
                <Input id="clientId" name="clientId" placeholder={t('clientIdPlaceholder')} data-cy="edit-mqtt-server-form-client-id-input" />
              </TextField>

              <TextField value={formValues.username} onChange={(v) => setFormValues((p) => ({ ...p, username: v }))}>
                <Label>{t('usernameLabel')}</Label>
                <Input id="username" name="username" placeholder={t('usernamePlaceholder')} data-cy="edit-mqtt-server-form-username-input" />
              </TextField>

              <PasswordInput
                label={t('passwordLabel')}
                id="password"
                name="password"
                placeholder={t('passwordPlaceholder')}
                value={formValues.password}
                onChange={(v: string) => setFormValues((p) => ({ ...p, password: v }))}
                fullWidth
                data-cy="edit-mqtt-server-form-password-input"
                autoComplete="off"
              />

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useTls"
                  name="useTls"
                  isSelected={formValues.useTls}
                  onChange={(checked) => setFormValues((prev) => ({ ...prev, useTls: checked }))}
                  data-cy="edit-mqtt-server-form-use-tls-checkbox"
                />
                <label htmlFor="useTls" className="text-sm">
                  {t('useTls')}
                </label>
              </div>

              <div>
                <Select
                  label={t('defaultPublishQosLabel')}

                  onSelectionChange={(keys) => {
                    if (keys === 'all') return;
                    const key = Array.from(keys)[0];
                    setFormValues((prev) => ({ ...prev, defaultPublishQos: Number(key) }));
                  }}
                 
                  data-cy="edit-mqtt-server-form-default-publish-qos-input"
                >
                  {qosOptions.map((option) => (
                    <ListBoxItem key={String(option)} id={String(option)}>{t(`qosOption.${option}`)}</ListBoxItem>
                  ))}
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="defaultPublishRetain"
                  name="defaultPublishRetain"
                  isSelected={!!formValues.defaultPublishRetain}
                  onChange={(checked) => setFormValues((prev) => ({ ...prev, defaultPublishRetain: checked }))}
                  data-cy="edit-mqtt-server-form-default-publish-retain-checkbox"
                >
                  {t('defaultPublishRetainLabel')}
                </Switch>
              </div>

              <div>
                <Select
                  label={t('defaultSubscribeQosLabel')}

                  onSelectionChange={(keys) => {
                    if (keys === 'all') return;
                    const key = Array.from(keys)[0];
                    setFormValues((prev) => ({ ...prev, defaultSubscribeQos: Number(key) }));
                  }}
                 
                  data-cy="edit-mqtt-server-form-default-subscribe-qos-input"
                >
                  {qosOptions.map((option) => (
                    <ListBoxItem key={String(option)} id={String(option)}>{t(`qosOption.${option}`)}</ListBoxItem>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <Button variant="secondary"
                onPress={handleCancel}
                data-cy="edit-mqtt-server-form-cancel-button"
              >
                {t('cancel')}
              </Button>
              <Button variant="primary"
                type="submit"
                isPending={updateMqttServer.isPending}
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
