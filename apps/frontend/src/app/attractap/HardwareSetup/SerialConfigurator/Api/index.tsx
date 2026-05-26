import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, AlertContent, AlertTitle, cn } from '@heroui/react';
import { Button } from '../../../../../components/button';
import { useCallback, useMemo, useState } from 'react';
import { getBaseUrl } from '../../../../../api';
import { PageHeader } from '../../../../../components/pageHeader';
import { useAttractapSerialComm } from '../Auth';

import de from './de.json';
import en from './en.json';

export function AttractapSerialConfiguratorApi({
  openDeviceSettings,
  className,
}: {
  openDeviceSettings: (deviceId: string) => void;
  className?: string;
}) {
  const { t } = useTranslations({
    de,
    en,
  });
  const { configuration, fetchConfiguration, isFetchingConfiguration, sendAuthedCommand } = useAttractapSerialComm();
  const [isUpdatingApi, setIsUpdatingApi] = useState(false);

  const status = configuration?.apiStatus ?? null;

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

  const apiDataMatchesServer = useMemo(() => {
    if (!status) {
      return null;
    }

    return (
      status.hostname === apiConnectionData.hostname &&
      status.port === apiConnectionData.port &&
      status.useSSL === apiConnectionData.useSSL
    );
  }, [status, apiConnectionData]);

  const handleOpenDeviceSettings = useCallback(() => {
    if (!status) {
      return;
    }
    openDeviceSettings(status.deviceId);
  }, [status, openDeviceSettings]);

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

  const updateApiData = useCallback(
    async (data?: { hostname: string; port: number; useSSL: boolean }) => {
      setIsUpdatingApi(true);
      try {
        await sendAuthedCommand('api.configuration.set', data ?? {});
        await fetchConfiguration();
      } finally {
        setIsUpdatingApi(false);
      }
    },
    [fetchConfiguration, sendAuthedCommand],
  );

  const manualUpdateApiData = useCallback(() => {
    const hostname = prompt('Hostname');
    if (!hostname) {
      console.debug('API-Status: no hostname provided', typeof hostname, hostname);
      return;
    }
    const port = prompt('Port');

    if (!port) {
      console.debug('API-Status: no port provided', typeof port, port);
      return;
    }

    const useSSL = window.confirm('Use SSL?');

    const payload = { hostname, port: Number(port), useSSL };
    console.debug('API-Status: updating api data manually', payload);
    updateApiData(payload);
  }, [updateApiData]);

  const handleRefresh = async () => {
    await fetchConfiguration();
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <PageHeader
        noMargin
        title={<span onDoubleClick={manualUpdateApiData}>{t('title')}</span>}
        actions={[
          {
            key: 'refresh-status',
            label: t('actions.refreshStatus'),
            isPending: isFetchingConfiguration || isUpdatingApi,
            onPress: handleRefresh,
          },
        ]}
      />

      <Alert status={alertColor}>
        <AlertContent>
          <AlertTitle>{alertTitle}</AlertTitle>
        </AlertContent>
        {alertDescription}
        {status?.status === 'authenticated' && (
          <Button variant="primary" onPress={handleOpenDeviceSettings}>
            {t('status.authenticated.openDeviceSettings.button')}
          </Button>
        )}
      </Alert>

      {apiDataMatchesServer === false && (
        <Alert status="default">
          <AlertContent>
            <AlertTitle>{t('apiDataDoesNotMatchesServer.alert.title')}</AlertTitle>
          </AlertContent>
          <div className="flex flex-row flex-wrap gap-4">
            <div>{t('apiDataDoesNotMatchesServer.alert.description')}</div>
            <Button variant="primary" onPress={() => updateApiData()} isPending={isUpdatingApi}>
              {t('apiDataDoesNotMatchesServer.alert.button')}
            </Button>
          </div>
        </Alert>
      )}
    </div>
  );
}
