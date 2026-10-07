import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBaseUrl } from '../../../../../api';
import { useAttractapSerialComm } from '../Auth';
import de from './de.json';
import en from './en.json';
export function useAttractapSerialConfiguratorApiState({
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
  return {
    t,
    isFetchingConfiguration,
    isUpdatingApi,
    showManual,
    setShowManual,
    status,
    apiConnectionData,
    manualHostname,
    setManualHostname,
    manualPort,
    setManualPort,
    manualUseSSL,
    setManualUseSSL,
    apiDataMatchesServer,
    handleOpenDeviceSettings,
    alertDescription,
    alertTitle,
    alertColor,
    handleApplyCurrentServer,
    handleManualSubmit,
    handleRefresh,
    className,
  } as const;
}
