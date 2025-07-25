import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, Button, Progress } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ESPTools } from '../../../../../utils/esp-tools';
import { getBaseUrl } from '../../../../../api';

import de from './de.json';
import en from './en.json';

interface AttraccessStatusData {
  status:
    | 'disconnected'
    | 'connecting_tcp'
    | 'connecting_websocket'
    | 'connected'
    | 'authenticating'
    | 'authenticated'
    | 'error_failed'
    | 'error_timed_out'
    | 'error_invalid_server';
  hostname: string;
  port: string;
  deviceId: string;
}

export function AttractapSerialConfiguratorAttraccess() {
  const { t } = useTranslations('attractap.hardwareSetup.serialConfigurator.attraccess', {
    de,
    en,
  });

  const [status, setStatus] = useState<AttraccessStatusData | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const attraccessDataMatchesServer = useMemo(() => {
    if (!status) {
      return null;
    }

    const apiUrl = new URL(getBaseUrl());

    console.log({
      statusHostname: status.hostname,
      apiUrlHostname: apiUrl.hostname,
      statusPort: status.port,
      apiUrlPort: apiUrl.port,
    });

    return status.hostname === apiUrl.hostname && status.port === apiUrl.port;
  }, [status]);

  const updateStatus = useCallback(async () => {
    setIsUpdatingStatus(true);

    const espTools = ESPTools.getInstance();
    const response = await espTools.sendCommand({ topic: 'attraccess.status', type: 'GET' });

    if (!response) {
      console.error('No response from ESP');
      return;
    }

    const data = JSON.parse(response) as AttraccessStatusData;

    setStatus(data);
    setIsUpdatingStatus(false);

    if (data.status === 'connected') {
      return;
    }

    if (data.status === 'disconnected') {
      return;
    }

    if (data.status === 'error_failed' || data.status === 'error_timed_out' || data.status === 'error_invalid_server') {
      return;
    }

    setTimeout(() => {
      updateStatus();
    }, 1000);
  }, []);

  useEffect(() => {
    updateStatus();
  }, [updateStatus]);

  const updateAttraccessData = useCallback(async () => {
    const apiUrl = new URL(getBaseUrl());
    const payload = { hostname: apiUrl.hostname, port: apiUrl.port };

    const espTools = ESPTools.getInstance();
    await espTools.sendCommand({
      topic: 'attraccess.configuration',
      type: 'SET',
      payload: JSON.stringify(payload),
    });

    setStatus({
      status: 'connecting_tcp',
      hostname: apiUrl.hostname,
      port: apiUrl.port,
      deviceId: '',
    });

    setTimeout(() => {
      updateStatus();
    }, 1000);
  }, [updateStatus]);

  return (
    <div className="flex flex-col gap-4">
      {isUpdatingStatus && <Progress isIndeterminate label={t('updating.label')} />}
      {status?.status === 'connected' && (
        <Alert color="success" title={t('connected.title')}>
          {t('connected.description', { deviceId: status.deviceId })}
        </Alert>
      )}
      {status?.status === 'connecting_tcp' && (
        <Progress isIndeterminate label={t('connecting.tcp.label', { hostname: status.hostname, port: status.port })} />
      )}
      {status?.status === 'connecting_websocket' && (
        <Progress
          isIndeterminate
          label={t('connecting.websocket.label', { hostname: status.hostname, port: status.port })}
        />
      )}
      {status?.status === 'disconnected' && (
        <Alert color="danger" title={t('disconnected.title')}>
          {t('disconnected.description', { hostname: status.hostname, port: status.port })}
        </Alert>
      )}
      {attraccessDataMatchesServer === false && (
        <Alert color="primary" title={t('attraccessDataDoesNotMatchesServer.alert.title')}>
          <div className="flex flex-row flex-wrap gap-4">
            <div>{t('attraccessDataDoesNotMatchesServer.alert.description')}</div>
            <Button onPress={updateAttraccessData} color="primary">
              {t('attraccessDataDoesNotMatchesServer.alert.button')}
            </Button>
          </div>
        </Alert>
      )}
    </div>
  );
}
