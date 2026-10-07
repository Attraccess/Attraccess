import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MqttManagementPort, parseManagementPort } from './managementPort';
import { useToastMessage } from '../../../components/toastProvider';
import en from './translations/create/en.json';
import de from './translations/create/de.json';
import { useState } from 'react';
import {
  useMqttServiceMqttServersCreateOne,
  CreateMqttServerDto,
  useMqttServiceMqttServersGetAllKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import type { CreateMqttServerFormProps } from './CreateMqttServerPage';

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
