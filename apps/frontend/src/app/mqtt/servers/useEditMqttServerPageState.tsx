import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MqttManagementPort, parseManagementPort } from './managementPort';
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

export function useEditMqttServerPageState() {
  const { serverId } = useParams<{ serverId: string }>();
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();
  const [managementPortInput, setManagementPortInput] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
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

  const {
    data: server,
    isLoading: isLoadingServer,
    isError,
  } = useMqttServiceMqttServersGetOneById({ id: Number(serverId) });

  useEffect(() => {
    if (server) {
      setClearPassword(false);
      setManagementPortInput(String((server as typeof server & MqttManagementPort).managementPort ?? ''));
      setFormValues({
        name: server.name,
        host: server.host,
        port: server.port,
        clientId: server.clientId ?? '',
        username: server.username ?? '',
        password: '',
        useTls: server.useTls,
        caCert: server.caCert ?? '',
        tlsInsecure: server.tlsInsecure ?? false,
        tlsServername: server.tlsServername ?? '',
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
      navigate('/devices/mqtt/servers');
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
    if (!serverId || managementPort === undefined) return;

    const { password, ...otherValues } = formValues;
    const requestBody: CreateMqttServerDto & MqttManagementPort = { ...otherValues, managementPort };
    // Omission keeps the saved secret; an explicit empty string clears it.
    if (clearPassword) requestBody.password = '';
    else if (password) requestBody.password = password;
    updateMqttServer.mutate({
      id: Number(serverId),
      requestBody,
    });
  };

  const handleCancel = () => {
    navigate('/devices/mqtt/servers');
  };
  return {
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
  } as const;
}
