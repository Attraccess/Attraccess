import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, Button, CircularProgress, cn } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ESPTools } from '../../../../../utils/esp-tools';
import { getBaseUrl } from '../../../../../api';
import { PageHeader } from '../../../../../components/pageHeader';

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
  useSSL: boolean;
}

interface Props {
  openDeviceSettings: (deviceId: string) => void;
  className?: string;
}

export function AttractapSerialConfiguratorAttraccess(props: Props) {
  const { className } = props;

  const { t } = useTranslations('attractap.hardwareSetup.serialConfigurator.attraccess', {
    de,
    en,
  });

  const [status, setStatus] = useState<AttraccessStatusData | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const apiConnectionData = useMemo(() => {
    const baseUrl = getBaseUrl();
    const url = new URL(baseUrl);

    const hostname = url.hostname;
    let port = url.port;
    if (!port.trim()) {
      port = url.protocol === 'https:' ? '443' : '80';
    }

    return {
      hostname,
      port: Number(port),
      useSSL: url.protocol === 'https:',
    };
  }, []);

  const attraccessDataMatchesServer = useMemo(() => {
    if (!status) {
      return null;
    }

    return (
      status.hostname === apiConnectionData.hostname &&
      status.port === apiConnectionData.port &&
      status.useSSL === apiConnectionData.useSSL
    );
  }, [status, apiConnectionData]);

  const updateStatus = useCallback(async () => {
    console.debug('Attraccess-Status: fetching status');
    setIsUpdatingStatus(true);

    const espTools = ESPTools.getInstance();
    const response = await espTools.sendCommand({ topic: 'attraccess.status', type: 'GET' }, true, 2000);

    if (!response) {
      console.error('Attraccess-Status: No response from ESP');
      console.debug('Attraccess-Status: retrying fetch status in 3s');
      setTimeout(() => {
        updateStatus();
      }, 3000);
      return;
    }

    let data: AttraccessStatusData;
    try {
      data = JSON.parse(response) as AttraccessStatusData;
      console.debug('Attraccess-Status: status', data);
    } catch (err) {
      console.error('Attraccess-Status: Invalid JSON response', response, err);
      console.debug('Attraccess-Status: retrying fetch status in 3s');
      setTimeout(() => {
        updateStatus();
      }, 3000);
      return;
    }

    setStatus(data);
    setIsUpdatingStatus(false);

    if (data.status === 'connected') {
      console.debug('Attraccess-Status: connected, exiting');
    }

    if (data.status === 'authenticated') {
      console.debug('Attraccess-Status: authenticated, exiting');
      return;
    }

    if (data.status === 'disconnected' && data.hostname === '') {
      console.debug('Attraccess-Status: disconnected, exiting');
      return;
    }

    if (data.status === 'error_failed' || data.status === 'error_timed_out' || data.status === 'error_invalid_server') {
      console.debug('Attraccess-Status: error, exiting', data.status);
      setTimeout(() => {
        updateStatus();
      }, 5000);
      return;
    }

    console.debug('Attraccess-Status: retrying fetch status in 1s');
    setTimeout(() => {
      updateStatus();
    }, 1000);
  }, []);

  useEffect(() => {
    updateStatus();
  }, [updateStatus]);

  const updateAttraccessData = useCallback(
    async (data?: { hostname: string; port: number; useSSL: boolean }) => {
      const payload = data ?? {
        hostname: apiConnectionData.hostname,
        port: apiConnectionData.port,
        useSSL: apiConnectionData.useSSL,
      };

      console.debug('Attraccess-Status: updating attraccess data', payload);

      const espTools = ESPTools.getInstance();
      const response = await espTools.sendCommand({
        topic: 'attraccess.configuration',
        type: 'SET',
        payload: JSON.stringify(payload),
      });

      console.debug('Attraccess-Status: updated attraccess data', response);

      setStatus({
        status: 'connecting_tcp',
        hostname: payload.hostname,
        port: payload.port,
        useSSL: payload.useSSL,
        deviceId: '',
      });

      setTimeout(() => {
        updateStatus();
      }, 1000);
    },
    [updateStatus, apiConnectionData]
  );

  const openDeviceSettings = useCallback(() => {
    if (!status) {
      return;
    }
    props.openDeviceSettings(status.deviceId);
  }, [status, props]);

  const alertDescription = useMemo(() => {
    if (!status) {
      return t('statusNotYetFetched.description');
    }

    return t(`status.${status.status}.description`, {
      hostname: status.hostname,
      port: status.port,
      deviceId: status.deviceId,
      protocolEmoji: status.useSSL ? '🔒' : '🔓',
    });
  }, [status, t]);

  const alertTitle = useMemo(() => {
    if (!status) {
      return t('statusNotYetFetched.title');
    }

    return t(`status.${status.status}.title`, {
      hostname: status.hostname,
      port: status.port,
      deviceId: status.deviceId,
      protocolEmoji: status.useSSL ? '🔒' : '🔓',
    });
  }, [status, t]);

  const alertColor = useMemo(() => {
    if (status?.status === 'authenticated') {
      return 'success';
    }

    return 'warning';
  }, [status]);

  const manualUpdateAttraccessData = useCallback(() => {
    const hostname = prompt('Hostname');
    if (!hostname) {
      console.debug('Attraccess-Status: no hostname provided', typeof hostname, hostname);
      return;
    }
    const port = prompt('Port');

    if (!port) {
      console.debug('Attraccess-Status: no port provided', typeof port, port);
      return;
    }

    const useSSL = window.confirm('Use SSL?');

    const payload = { hostname, port: Number(port), useSSL };
    console.debug('Attraccess-Status: updating attraccess data manually', payload);
    updateAttraccessData(payload);
  }, [updateAttraccessData]);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <PageHeader
        noMargin
        title={<span onDoubleClick={manualUpdateAttraccessData}>{t('title')}</span>}
        actions={isUpdatingStatus ? <CircularProgress isIndeterminate /> : undefined}
      />

      <Alert color={alertColor} title={alertTitle}>
        {alertDescription}
        {status?.status === 'authenticated' && (
          <Button onPress={openDeviceSettings} color="primary">
            {t('status.authenticated.openDeviceSettings.button')}
          </Button>
        )}
      </Alert>

      {attraccessDataMatchesServer === false && (
        <Alert color="primary" title={t('attraccessDataDoesNotMatchesServer.alert.title')}>
          <div className="flex flex-row flex-wrap gap-4">
            <div>{t('attraccessDataDoesNotMatchesServer.alert.description')}</div>
            <Button onPress={() => updateAttraccessData()} color="primary">
              {t('attraccessDataDoesNotMatchesServer.alert.button')}
            </Button>
          </div>
        </Alert>
      )}
    </div>
  );
}
