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
  port: number;
  deviceId: string;
}

interface Props {
  openDeviceSettings: (deviceId: string) => void;
}

export function AttractapSerialConfiguratorAttraccess(props: Props) {
  const { t } = useTranslations('attractap.hardwareSetup.serialConfigurator.attraccess', {
    de,
    en,
  });

  const [status, setStatus] = useState<AttraccessStatusData | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const apiHostnameAndPort = useMemo(() => {
    const baseUrl = getBaseUrl();
    const url = new URL(baseUrl);

    const hostname = url.hostname;
    let port = url.port;
    if (!port.trim()) {
      port = '80';
    }

    return {
      hostname,
      port: Number(port),
    };
  }, []);

  const attraccessDataMatchesServer = useMemo(() => {
    if (!status) {
      return null;
    }

    console.log({
      statusHostname: status.hostname,
      apiUrlHostname: apiHostnameAndPort.hostname,
      statusPort: status.port,
      apiUrlPort: apiHostnameAndPort.port,
    });

    return status.hostname === apiHostnameAndPort.hostname && status.port === apiHostnameAndPort.port;
  }, [status, apiHostnameAndPort]);

  const updateStatus = useCallback(async () => {
    console.log('fetching status');
    setIsUpdatingStatus(true);

    const espTools = ESPTools.getInstance();
    const response = await espTools.sendCommand({ topic: 'attraccess.status', type: 'GET' }, true, 2000);

    if (!response) {
      console.error('No response from ESP');
      console.log('retrying fetch status in 3s');
      setTimeout(() => {
        updateStatus();
      }, 3000);
      return;
    }

    const data = JSON.parse(response) as AttraccessStatusData;
    console.log('status', data);

    setStatus(data);
    setIsUpdatingStatus(false);

    if (data.status === 'connected') {
      console.log('connected, exiting');
      return;
    }

    if (data.status === 'authenticated') {
      console.log('authenticated, exiting');
      return;
    }

    if (data.status === 'disconnected' && data.hostname === '') {
      console.log('disconnected, exiting');
      return;
    }

    if (data.status === 'error_failed' || data.status === 'error_timed_out' || data.status === 'error_invalid_server') {
      console.log('error, exiting', data.status);
      setTimeout(() => {
        updateStatus();
      }, 5000);
      return;
    }

    console.log('retrying fetch status in 1s');
    setTimeout(() => {
      updateStatus();
    }, 1000);
  }, []);

  useEffect(() => {
    updateStatus();
  }, [updateStatus]);

  const updateAttraccessData = useCallback(async () => {
    const payload = { hostname: apiHostnameAndPort.hostname, port: apiHostnameAndPort.port };

    console.log('updating attraccess data', payload);

    const espTools = ESPTools.getInstance();
    const response = await espTools.sendCommand({
      topic: 'attraccess.configuration',
      type: 'SET',
      payload: JSON.stringify(payload),
    });

    console.log('updated attraccess data', response);

    setStatus({
      status: 'connecting_tcp',
      hostname: apiHostnameAndPort.hostname,
      port: apiHostnameAndPort.port,
      deviceId: '',
    });

    setTimeout(() => {
      updateStatus();
    }, 1000);
  }, [updateStatus, apiHostnameAndPort]);

  const openDeviceSettings = useCallback(() => {
    if (!status) {
      return;
    }
    props.openDeviceSettings(status.deviceId);
  }, [status, props]);

  return (
    <div className="flex flex-col gap-4">
      {isUpdatingStatus && <Progress isIndeterminate label={t('updating.label')} />}
      {status?.status === 'authenticated' && (
        <Alert color="success" title={t('connected.title')}>
          {t('connected.description', { deviceId: status.deviceId })}
          <Button onPress={openDeviceSettings} color="primary">
            {t('connected.openDeviceSettings.button')}
          </Button>
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
