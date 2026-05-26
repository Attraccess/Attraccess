import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, AlertContent, AlertTitle, Label, ProgressBar, ProgressBarFill, ProgressBarTrack, TextField, Input, cn } from '@heroui/react';
import { Button } from '../../../../../components/button';
import { useMemo, useState } from 'react';
import { PasswordInput } from '../../../../../components/PasswordInput';
import { PageHeader } from '../../../../../components/pageHeader';
import { useAttractapSerialComm } from '../Auth';

import de from './de.json';
import en from './en.json';

export function AttractapSerialConfiguratorNetwork({ className }: { className?: string }) {
  const { t } = useTranslations({
    de,
    en,
  });
  const { configuration, fetchConfiguration, isFetchingConfiguration, sendAuthedCommand } = useAttractapSerialComm();

  const [selectedWifiSSID, setSelectedWifiSSID] = useState<string | null>(null);
  const [wifiPassword, setWifiPassword] = useState<string | null>(null);
  const [isWifiConnecting, setIsWifiConnecting] = useState(false);

  const status = useMemo(() => configuration?.networkStatus ?? null, [configuration?.networkStatus]);
  const wifiNetworks = useMemo(() => configuration?.wifiNetworks ?? [], [configuration?.wifiNetworks]);

  const networkSelectItems = useMemo(() => {
    return wifiNetworks
      .map((network) => ({
        key: network.ssid,
        label: network.ssid,
      }))
      .filter((item, index, self) => index === self.findIndex((t) => t.key === item.key));
  }, [wifiNetworks]);

  const handleSetWifiCredentials = async () => {
    if (!selectedWifiSSID) {
      return;
    }
    setIsWifiConnecting(true);
    try {
      await sendAuthedCommand('network.wifi.credentials.set', { ssid: selectedWifiSSID, password: wifiPassword ?? '' });
      await fetchConfiguration();
    } finally {
      setIsWifiConnecting(false);
    }
  };

  const handleRefresh = async () => {
    await fetchConfiguration();
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <PageHeader
        title={t('title')}
        noMargin
        actions={[
          {
            key: 'refresh-status',
            label: t('actions.refreshStatus'),
            isPending: isFetchingConfiguration,
            onPress: handleRefresh,
          },
          {
            key: 'refresh-wifi',
            label: t('actions.refreshWifi'),
            isPending: isFetchingConfiguration,
            onPress: handleRefresh,
          },
        ]}
      />

      {status?.wifi_connected && (
        <Alert status="success">
          <AlertContent>
            <AlertTitle>{t('wifi.connected.title')}</AlertTitle>
          </AlertContent>
          {t('wifi.connected.description', { ssid: status.wifi_ssid, ip: status.wifi_ip })}
        </Alert>
      )}
      {isWifiConnecting && (
        <ProgressBar isIndeterminate aria-label={t('wifi.connecting.label', { ssid: selectedWifiSSID })}>
          <ProgressBarTrack>
            <ProgressBarFill />
          </ProgressBarTrack>
        </ProgressBar>
      )}
      {status && !status.wifi_connected && !isWifiConnecting && (
        <Alert status="danger">
          <AlertContent>
            <AlertTitle>{t('wifi.disconnected.title')}</AlertTitle>
          </AlertContent>
          {t('wifi.disconnected.description', { ssid: status.wifi_ssid ?? '' })}
        </Alert>
      )}

      {status?.ethernet_connected ? (
        <Alert status="success">
          <AlertContent>
            <AlertTitle>{t('ethernet.connected.title')}</AlertTitle>
          </AlertContent>
          {t('ethernet.connected.description', { ip: status.ethernet_ip })}
        </Alert>
      ) : (
        <Alert status="warning" >
          <AlertContent>
            <AlertTitle>{t('ethernet.disconnected.title')}</AlertTitle>
          </AlertContent>
        </Alert>
      )}

      <TextField value={selectedWifiSSID ?? ''} onChange={setSelectedWifiSSID}>
        <Label>{t('ssidSelect.label')}</Label>
        <Input list="wifi-ssid-list" />
        <datalist id="wifi-ssid-list">
          {networkSelectItems.map((item) => (
            <option key={item.key} value={item.key}>{item.label}</option>
          ))}
        </datalist>
      </TextField>
      <PasswordInput
        label={t('password.label')}
        value={wifiPassword ?? ''}
        onChange={(setWifiPassword)}
        autoComplete="off"
      />
      <Button variant="primary"
        onPress={handleSetWifiCredentials}
        isPending={isWifiConnecting}
        isDisabled={!selectedWifiSSID}
      >
        {t('setCredentials.label')}
      </Button>
    </div>
  );
}
