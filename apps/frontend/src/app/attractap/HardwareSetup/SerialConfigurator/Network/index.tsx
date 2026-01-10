import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, Autocomplete, AutocompleteItem, Button, CircularProgress, cn, Progress } from '@heroui/react';
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
            <Button size="sm" onPress={handleRefresh} isLoading={isFetchingConfiguration}>
              {t('actions.refreshStatus')}
            </Button>
            <Button size="sm" onPress={handleRefresh} isLoading={isFetchingConfiguration}>
              {t('actions.refreshWifi')}
            </Button>
            {isFetchingConfiguration && <CircularProgress size="sm" isIndeterminate />}
          </div>
        }
      />

      {status?.wifi_connected && (
        <Alert color="success" title={t('wifi.connected.title')}>
          {t('wifi.connected.description', { ssid: status.wifi_ssid, ip: status.wifi_ip })}
        </Alert>
      )}
      {isWifiConnecting && <Progress isIndeterminate label={t('wifi.connecting.label', { ssid: selectedWifiSSID })} />}
      {status && !status.wifi_connected && !isWifiConnecting && (
        <Alert color="danger" title={t('wifi.disconnected.title')}>
          {t('wifi.disconnected.description', { ssid: status.wifi_ssid ?? '' })}
        </Alert>
      )}

      {status?.ethernet_connected ? (
        <Alert color="success" title={t('ethernet.connected.title')}>
          {t('ethernet.connected.description', { ip: status.ethernet_ip })}
        </Alert>
      ) : (
        <Alert color="warning" title={t('ethernet.disconnected.title')} />
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
        {(item) => <AutocompleteItem key={item.key}>{item.label}</AutocompleteItem>}
      </Autocomplete>
      <PasswordInput
        label={t('password.label')}
        value={wifiPassword ?? ''}
        onChange={(e) => setWifiPassword(e.target.value)}
        autoComplete="off"
      />
      <Button
        onPress={handleSetWifiCredentials}
        color="primary"
        isLoading={isWifiConnecting}
        isDisabled={!selectedWifiSSID}
      >
        {t('setCredentials.label')}
      </Button>
    </div>
  );
}
