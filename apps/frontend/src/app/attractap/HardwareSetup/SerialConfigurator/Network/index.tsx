import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, AlertContent, AlertTitle, Autocomplete, Button, ListBoxItem, ProgressBar, ProgressBarFill, ProgressBarTrack, ProgressCircle, ProgressCircleFillCircle, ProgressCircleTrack, ProgressCircleTrackCircle, cn } from '@heroui/react';
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
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onPress={handleRefresh} isPending={isFetchingConfiguration}>
              {t('actions.refreshStatus')}
            </Button>
            <Button size="sm" onPress={handleRefresh} isPending={isFetchingConfiguration}>
              {t('actions.refreshWifi')}
            </Button>
            {isFetchingConfiguration && (
              <ProgressCircle isIndeterminate>
                <ProgressCircleTrack>
                  <ProgressCircleTrackCircle />
                  <ProgressCircleFillCircle />
                </ProgressCircleTrack>
              </ProgressCircle>
            )}
          </div>
        }
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

      <Autocomplete
        allowsCustomValue
        defaultItems={networkSelectItems}
        label={t('ssidSelect.label')}
        defaultSelectedKey={selectedWifiSSID ?? undefined}
        onSelectionChange={(ssid) => setSelectedWifiSSID((ssid as string) ?? null)}
        onInputChange={(value) => setSelectedWifiSSID(value)}
        isLoading={isFetchingConfiguration}
        inputValue={selectedWifiSSID ?? ''}
      >
        {(item) => <ListBoxItem key={item.key} id={item.key}>{item.label}</ListBoxItem>}
      </Autocomplete>
      <PasswordInput
        label={t('password.label')}
        value={wifiPassword ?? ''}
        onChange={(e) => setWifiPassword(e.target.value)}
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
