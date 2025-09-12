import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, Autocomplete, AutocompleteItem, Button, CircularProgress, cn, Progress } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ESPTools } from '../../../../../utils/esp-tools';
import { PasswordInput } from '../../../../../components/PasswordInput';
import { PageHeader } from '../../../../../components/pageHeader';

import de from './de.json';
import en from './en.json';

interface NetworkStatusData {
  wifi_connected: boolean;
  wifi_ssid: string | null;
  wifi_ip: string;
  ethernet_connected: boolean;
  ethernet_ip: string;
}

interface WifiNetwork {
  ssid: string;
  rssi: number;
  channel: number;
  encryption: string;
  isOpen: boolean;
}

interface Props {
  className?: string;
}

export function AttractapSerialConfiguratorNetwork(props: Props) {
  const { className } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const [networkStatus, setNetworkStatus] = useState<NetworkStatusData | null>(null);
  const [availableWifiNetworks, setAvailableWifiNetworks] = useState<WifiNetwork[]>([]);
  const [isScanningWifiNetworks, setIsScanningWifiNetworks] = useState(false);
  const [selectedWifiSSID, setSelectedWifiSSID] = useState<string | null>(null);
  const [wifiPassword, setWifiPassword] = useState<string | null>(null);
  const [isUpdatingNetworkStatus, setIsUpdatingNetworkStatus] = useState(false);
  const [isWifiConnecting, setIsWifiConnecting] = useState(false);

  const updateNetworkStatus = useCallback(async () => {
    setIsUpdatingNetworkStatus(true);

    const espTools = ESPTools.getInstance();
    const response = await espTools.sendCommand({ topic: 'network.status', type: 'GET' }, true, 2000);

    if (!response) {
      console.error('Network-Status: No response from ESP');
      console.debug('Network-Status: retrying fetch status in 3s');
      setTimeout(() => {
        updateNetworkStatus();
      }, 3000);
      return;
    }

    let data: NetworkStatusData;
    try {
      data = JSON.parse(response) as NetworkStatusData;
    } catch (error) {
      console.error('Network-Status: Invalid JSON response', response, error);
      console.debug('Network-Status: retrying fetch status in 3s');
      setTimeout(() => {
        updateNetworkStatus();
      }, 3000);
      return;
    }

    setNetworkStatus(data);
    setIsUpdatingNetworkStatus(false);

    if (isWifiConnecting) {
      const isDesiredWifiConnected = data.wifi_connected && !!data.wifi_ssid && data.wifi_ssid === selectedWifiSSID;
      if (!isDesiredWifiConnected) {
        setTimeout(() => {
          updateNetworkStatus();
        }, 1000);
      } else {
        setIsWifiConnecting(false);
      }
    }
  }, [isWifiConnecting, selectedWifiSSID]);

  const scanForWifiNetworks = useCallback(async () => {
    console.debug('Network-Status: scanning for wifi networks');
    setIsScanningWifiNetworks(true);

    const espTools = ESPTools.getInstance();
    const response = await espTools.sendCommand({ topic: 'network.wifi.scan', type: 'GET' });

    if (!response) {
      console.error('Wifi-Scan: No response from ESP');
      console.debug('Wifi-Scan: retrying scan in 5s');
      setTimeout(() => {
        scanForWifiNetworks();
      }, 5000);
      return;
    }

    try {
      const data = JSON.parse(response) as WifiNetwork[];
      setAvailableWifiNetworks(data);
    } catch (error) {
      console.error('Wifi-Scan: Invalid JSON response', response, error);
      console.debug('Wifi-Scan: retrying scan in 5s');
      setTimeout(() => {
        scanForWifiNetworks();
      }, 5000);
    } finally {
      setIsScanningWifiNetworks(false);
    }
  }, []);

  useEffect(() => {
    updateNetworkStatus().then(() => {
      scanForWifiNetworks();
    });
  }, [updateNetworkStatus, scanForWifiNetworks]);

  const networkSelectItems = useMemo(() => {
    return availableWifiNetworks
      .map((network) => ({
        key: network.ssid,
        label: network.ssid,
      }))
      .filter((item, index, self) => index === self.findIndex((t) => t.key === item.key));
  }, [availableWifiNetworks]);

  const onSSIDSelectionChange = useCallback((ssid: string | number | null) => {
    setSelectedWifiSSID((ssid as string) ?? null);
  }, []);

  const setWifiCredentials = useCallback(async () => {
    if (!selectedWifiSSID) {
      return;
    }

    const payload = { ssid: selectedWifiSSID, password: wifiPassword };
    const espTools = ESPTools.getInstance();
    await espTools.sendCommand({
      topic: 'network.wifi.credentials',
      type: 'SET',
      payload: JSON.stringify(payload),
    });

    setIsWifiConnecting(true);

    setTimeout(() => {
      updateNetworkStatus();
    }, 1000);
  }, [selectedWifiSSID, wifiPassword, updateNetworkStatus]);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <PageHeader
        title={t('title')}
        noMargin
        actions={isUpdatingNetworkStatus ? <CircularProgress isIndeterminate /> : undefined}
      />

      {networkStatus?.wifi_connected && (
        <Alert color="success" title={t('wifi.connected.title')}>
          {t('wifi.connected.description', { ssid: networkStatus.wifi_ssid, ip: networkStatus.wifi_ip })}
        </Alert>
      )}
      {isWifiConnecting && <Progress isIndeterminate label={t('wifi.connecting.label', { ssid: selectedWifiSSID })} />}
      {networkStatus && !networkStatus.wifi_connected && !isWifiConnecting && (
        <Alert color="danger" title={t('wifi.disconnected.title')}>
          {t('wifi.disconnected.description', { ssid: networkStatus.wifi_ssid ?? '' })}
        </Alert>
      )}

      {networkStatus?.ethernet_connected ? (
        <Alert color="success" title={t('ethernet.connected.title')}>
          {t('ethernet.connected.description', { ip: networkStatus.ethernet_ip })}
        </Alert>
      ) : (
        <Alert color="warning" title={t('ethernet.disconnected.title')} />
      )}

      <Autocomplete
        allowsCustomValue
        defaultItems={networkSelectItems}
        label={t('ssidSelect.label')}
        defaultSelectedKey={selectedWifiSSID ?? undefined}
        onSelectionChange={onSSIDSelectionChange}
        onInputChange={(value) => setSelectedWifiSSID(value)}
        isLoading={isScanningWifiNetworks}
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
      <Button onPress={setWifiCredentials} color="primary">
        {t('setCredentials.label')}
      </Button>
    </div>
  );
}
