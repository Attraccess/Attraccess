import { AlertStatusIcon, Button, StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, AlertContent, AlertDescription, AlertTitle, Separator } from '@heroui/react';
import { BluetoothIcon, UsbIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { BleConfigurator, isWebBluetoothAvailable } from '../../../utils/ble-configurator';
import { ESPTools } from '../../../utils/esp-tools';

import de from './de.json';
import en from './en.json';

type BluetoothNotice = 'unavailable' | 'failed' | null;

interface Props {
  /** The reader or bridge closed Bluetooth after it was approved; say so instead of starting blank. */
  closedAfterPairing?: boolean;
  /** The Bluetooth link dropped during setup; explain instead of starting blank. */
  bluetoothLost?: boolean;
}

export function ConnectScreen({ closedAfterPairing = false, bluetoothLost = false }: Props) {
  const { t } = useTranslations({ de, en });
  const [isConnectingUsb, setIsConnectingUsb] = useState(false);
  const [isConnectingBluetooth, setIsConnectingBluetooth] = useState(false);
  const [bluetoothNotice, setBluetoothNotice] = useState<BluetoothNotice>(null);

  const connectUsb = useCallback(async () => {
    setIsConnectingUsb(true);
    try {
      await ESPTools.getInstance().connectToDevice();
    } catch (err) {
      console.error('Failed to connect to device', err);
    } finally {
      setIsConnectingUsb(false);
    }
  }, []);

  const connectBluetooth = useCallback(async () => {
    if (!isWebBluetoothAvailable()) {
      setBluetoothNotice('unavailable');
      return;
    }
    setIsConnectingBluetooth(true);
    try {
      // false: the user closed the device picker, nothing to report.
      await BleConfigurator.getInstance().connect();
    } catch (err) {
      console.error('Failed to connect over Bluetooth', err);
      setBluetoothNotice('failed');
    } finally {
      setIsConnectingBluetooth(false);
    }
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      {closedAfterPairing && (
        <Alert status="success" className="text-left">
          <AlertStatusIcon status="success" />
          <AlertContent>
            <AlertTitle>{t('connect.bluetooth.closedAfterPairing.title')}</AlertTitle>
            <AlertDescription>{t('connect.bluetooth.closedAfterPairing.description')}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
      {bluetoothLost && (
        <Alert status="warning" className="text-left">
          <AlertStatusIcon status="warning" />
          <AlertContent>
            <AlertTitle>{t('connect.bluetooth.lost.title')}</AlertTitle>
            <AlertDescription>{t('connect.bluetooth.lost.description')}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
      <div className="rounded-full bg-primary-100 p-4 dark:bg-primary-900/40">
        <UsbIcon className="w-8 h-8 text-primary-600 dark:text-primary-300" />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">{t('connect.title')}</h3>
        <p className="max-w-md text-sm text-muted">{t('connect.description')}</p>
        <p className="max-w-md text-sm text-muted">{t('connect.bleBridgeHint')}</p>
      </div>
      <Button variant="primary" onPress={connectUsb} isPending={isConnectingUsb} className="w-full max-w-xs">
        {t('connect.button.label')}
      </Button>

      <Separator className="max-w-xs" />

      <p className="max-w-md text-sm text-muted">{t('connect.bluetooth.hint')}</p>
      <Button
        variant="secondary"
        onPress={connectBluetooth}
        isPending={isConnectingBluetooth}
        className="w-full max-w-xs"
        data-cy="attractap-setup-connect-bluetooth"
      >
        <BluetoothIcon className="w-4 h-4" />
        {t('connect.bluetooth.button')}
      </Button>

      <StatusDialog
        isOpen={bluetoothNotice === 'unavailable'}
        onClose={() => setBluetoothNotice(null)}
        status="info"
        title={t('connect.bluetooth.unavailable.title')}
      >
        {t('connect.bluetooth.unavailable.description')}
      </StatusDialog>
      <StatusDialog
        isOpen={bluetoothNotice === 'failed'}
        onClose={() => setBluetoothNotice(null)}
        status="error"
        title={t('connect.bluetooth.failed.title')}
      >
        {t('connect.bluetooth.failed.description')}
      </StatusDialog>
    </div>
  );
}
