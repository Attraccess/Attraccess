import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, AlertContent, AlertDescription, AlertTitle, Input, Label, TextField, cn } from '@heroui/react';
import { Button } from '../../../../../components/button';
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBaseUrl } from '../../../../../api';
import { LabeledSwitch } from '../../../../../components/labeledSwitch';
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
  const [showManual, setShowManual] = useState(false);

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

  const [manualHostname, setManualHostname] = useState(apiConnectionData.hostname);
  const [manualPort, setManualPort] = useState(String(apiConnectionData.port));
  const [manualUseSSL, setManualUseSSL] = useState(apiConnectionData.useSSL);

  // Seed the manual form with the reader's current values once they are known.
  useEffect(() => {
    if (!status) {
      return;
    }
    setManualHostname(status.hostname);
    setManualPort(String(status.port));
    setManualUseSSL(status.useSSL);
  }, [status]);

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
    async (data: { hostname: string; port: number; useSSL: boolean }) => {
      setIsUpdatingApi(true);
      try {
        await sendAuthedCommand('api.configuration.set', data);
        await fetchConfiguration();
      } finally {
        setIsUpdatingApi(false);
      }
    },
    [fetchConfiguration, sendAuthedCommand],
  );

  const handleApplyCurrentServer = useCallback(() => {
    updateApiData(apiConnectionData);
  }, [updateApiData, apiConnectionData]);

  const handleManualSubmit = useCallback(() => {
    const port = Number(manualPort);
    if (!manualHostname.trim() || !Number.isFinite(port) || port <= 0) {
      return;
    }
    updateApiData({ hostname: manualHostname.trim(), port, useSSL: manualUseSSL });
  }, [manualHostname, manualPort, manualUseSSL, updateApiData]);

  const handleRefresh = async () => {
    await fetchConfiguration();
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <PageHeader
        noMargin
        title={t('title')}
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
        <Alert status="warning">
          <AlertStatusIcon status="warning" />
          <AlertContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <AlertTitle>{t('apiDataDoesNotMatchesServer.alert.title')}</AlertTitle>
              <AlertDescription>
                {t('apiDataDoesNotMatchesServer.alert.description', {
                  hostname: apiConnectionData.hostname,
                  port: apiConnectionData.port,
                  protocolEmoji: apiConnectionData.useSSL ? '🔒' : '🔓',
                })}
              </AlertDescription>
            </div>
            <Button
              variant="primary"
              onPress={handleApplyCurrentServer}
              isPending={isUpdatingApi}
              className="self-start"
              data-cy="attractap-api-apply-current-server-button"
            >
              {t('apiDataDoesNotMatchesServer.alert.button')}
            </Button>
          </AlertContent>
        </Alert>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-default-200 p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-sm font-medium"
          onClick={() => setShowManual((prev) => !prev)}
          data-cy="attractap-api-manual-toggle"
        >
          {t('manual.title')}
          <span className="text-muted">{showManual ? '−' : '+'}</span>
        </button>

        {showManual && (
          <div className="flex flex-col gap-3">
            <TextField value={manualHostname} onChange={setManualHostname}>
              <Label>{t('manual.hostname')}</Label>
              <Input data-cy="attractap-api-manual-hostname" />
            </TextField>
            <TextField value={manualPort} onChange={setManualPort}>
              <Label>{t('manual.port')}</Label>
              <Input inputMode="numeric" data-cy="attractap-api-manual-port" />
            </TextField>
            <LabeledSwitch isSelected={manualUseSSL} onChange={setManualUseSSL} data-cy="attractap-api-manual-ssl">
              {t('manual.useSSL')}
            </LabeledSwitch>
            <Button
              variant="secondary"
              onPress={handleManualSubmit}
              isPending={isUpdatingApi}
              data-cy="attractap-api-manual-submit"
            >
              {t('manual.submit')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
