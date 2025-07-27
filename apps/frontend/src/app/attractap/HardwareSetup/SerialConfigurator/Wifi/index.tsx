import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, Autocomplete, AutocompleteItem, Button, CircularProgress, cn, Progress } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ESPTools } from '../../../../../utils/esp-tools';
import { PasswordInput } from '../../../../../components/PasswordInput';
import { PageHeader } from '../../../../../components/pageHeader';

import de from './de.json';
import en from './en.json';

interface WifiStatusData {
  status: 'connecting' | 'connected' | 'disconnected';
  ssid: string;
  ip: string;
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

export function AttractapSerialConfiguratorWifi(props: Props) {
  const { className } = props;

  const { t } = useTranslations('attractap.hardwareSetup.serialConfigurator.wifi', {
    de,
    en,
  });

  const [wifiStatus, setWifiStatus] = useState<WifiStatusData | null>(null);
  const [availableWifiNetworks, setAvailableWifiNetworks] = useState<WifiNetwork[]>([]);
  const [isScanningWifiNetworks, setIsScanningWifiNetworks] = useState(false);
  const [selectedWifiSSID, setSelectedWifiSSID] = useState<string | null>(null);
  const [wifiPassword, setWifiPassword] = useState<string | null>(null);
  const [isUpdatingWifiStatus, setIsUpdatingWifiStatus] = useState(false);

  const updateWifiStatus = useCallback(async () => {
    setIsUpdatingWifiStatus(true);

    const espTools = ESPTools.getInstance();
    const response = await espTools.sendCommand({ topic: 'network.wifi.status', type: 'GET' }, true, 2000);

    if (!response) {
      console.error('Wifi-Status: No response from ESP');
      console.debug('Wifi-Status: retrying fetch status in 3s');
      setTimeout(() => {
        updateWifiStatus();
      }, 3000);
      return;
    }

    let data: WifiStatusData;
    try {
      data = JSON.parse(response) as WifiStatusData;
    } catch (error) {
      console.error('Wifi-Status: Invalid JSON response', response, error);
      console.debug('Wifi-Status: retrying fetch status in 3s');
      setTimeout(() => {
        updateWifiStatus();
      }, 3000);
      return;
    }

    setSelectedWifiSSID(data.ssid);

    setWifiStatus(data);
    setIsUpdatingWifiStatus(false);

    if (data.status === 'connecting') {
      setTimeout(() => {
        updateWifiStatus();
      }, 1000);
    }
  }, []);

  const scanForWifiNetworks = useCallback(async () => {
    console.debug('Wifi-Status: scanning for wifi networks');
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
    updateWifiStatus().then(() => {
      scanForWifiNetworks();
    });
  }, [updateWifiStatus, scanForWifiNetworks]);

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

    setWifiStatus({
      ssid: selectedWifiSSID,
      ip: '',
      status: 'connecting',
    });

    setTimeout(() => {
      updateWifiStatus();
    }, 1000);
  }, [selectedWifiSSID, wifiPassword, updateWifiStatus]);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <PageHeader
        title={t('title')}
        noMargin
        actions={isUpdatingWifiStatus ? <CircularProgress isIndeterminate /> : undefined}
      />

      {wifiStatus?.status === 'connected' && (
        <Alert color="success" title={t('connected.title')}>
          {t('connected.description', { ssid: wifiStatus.ssid, ip: wifiStatus.ip })}
        </Alert>
      )}
      {wifiStatus?.status === 'connecting' && (
        <Progress isIndeterminate label={t('connecting.label', { ssid: wifiStatus.ssid })} />
      )}
      {wifiStatus?.status === 'disconnected' && (
        <Alert color="danger" title={t('disconnected.title')}>
          {t('disconnected.description', { ssid: wifiStatus.ssid })}
        </Alert>
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
      />
      <Button onPress={setWifiCredentials} color="primary">
        {t('setCredentials.label')}
      </Button>
    </div>
  );
}
