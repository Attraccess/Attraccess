import { BleConfigurator } from './ble-configurator';
import type { ConfiguratorTransport } from './configurator-transport';
import { ESPTools } from './esp-tools';

/** The transport the setup screens talk to: Bluetooth while a reader or bridge is connected, otherwise USB serial. */
export function getActiveConfiguratorTransport(): ConfiguratorTransport {
  const bluetooth = BleConfigurator.getInstance();
  return bluetooth.isConnected ? bluetooth : ESPTools.getInstance();
}
