import { useEffect, useState } from 'react';
import { BleConfigurator } from '../../../utils/ble-configurator';
import type { ConfiguratorTransportKind, ConnectionStateEvent } from '../../../utils/configurator-transport';
import { ESPTools } from '../../../utils/esp-tools';

export interface ConfiguratorConnection {
  /** The connected transport, or null while nothing is connected. */
  kind: ConfiguratorTransportKind | null;
  /** The reader or bridge closed Bluetooth on purpose after it was authenticated (not an error). */
  closedAfterPairing: boolean;
  /** The Bluetooth link dropped unexpectedly; the unsaved form is gone, so say why. */
  bluetoothLost: boolean;
}

function currentKind(): ConfiguratorTransportKind | null {
  if (BleConfigurator.getInstance().isConnected) return 'bluetooth';
  if (ESPTools.getInstance().isConnected) return 'serial';
  return null;
}

/** Follows the serial and Bluetooth configurator connections. */
export function useConfiguratorConnection(): ConfiguratorConnection {
  const [connection, setConnection] = useState<ConfiguratorConnection>(() => ({
    kind: currentKind(),
    closedAfterPairing: false,
    bluetoothLost: false,
  }));

  useEffect(() => {
    const serial = ESPTools.getInstance();
    const bluetooth = BleConfigurator.getInstance();
    const onSerialState = () => setConnection({ kind: currentKind(), closedAfterPairing: false, bluetoothLost: false });
    const onBluetoothState = (event: ConnectionStateEvent) =>
      setConnection({
        kind: currentKind(),
        closedAfterPairing: !event.connected && !!event.closedAfterPairing,
        bluetoothLost: !event.connected && !!event.lost,
      });
    serial.on('connectionState', onSerialState);
    bluetooth.on('connectionState', onBluetoothState);
    return () => {
      serial.off('connectionState', onSerialState);
      bluetooth.off('connectionState', onBluetoothState);
    };
  }, []);

  return connection;
}
