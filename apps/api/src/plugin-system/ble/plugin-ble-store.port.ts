import type {
  NewPluginBleEndpoint,
  PluginBleEndpointChanges,
  PluginBleEndpointRecord,
  PluginBleReaderAccess,
} from '@attraccess/application-models';

/**
 * Persistence of the plugin BLE transport: the endpoints plugins own and the readers' opt-in. Writes fail with the
 * driver's error; the host interprets it with the neutral helpers of `database/persistence-errors` (a duplicate
 * address binding is a unique violation, a deleted reader a foreign key violation).
 */
export interface PluginBleStore {
  /** Readers that allow plugins to use Bluetooth, by id; with `readerIds`, only those among them. */
  listOpenReaders(readerIds?: number[]): Promise<PluginBleReaderAccess[]>;
  findReader(readerId: number): Promise<PluginBleReaderAccess | null>;

  findEndpoint(pluginId: string, id: string): Promise<PluginBleEndpointRecord | null>;
  /** The plugin's endpoints, oldest first. */
  listEndpoints(pluginId: string): Promise<PluginBleEndpointRecord[]>;
  /** Everything bound to this device address, whichever plugin owns it. */
  listEndpointsAtAddress(
    address: string,
  ): Promise<Array<Pick<PluginBleEndpointRecord, 'id' | 'pluginId' | 'readerId'>>>;
  /** Stores the endpoint and returns it as stored (timestamps included). */
  createEndpoint(endpoint: NewPluginBleEndpoint): Promise<PluginBleEndpointRecord>;
  /** Applies the changes and returns the endpoint as stored; null when it no longer exists. */
  updateEndpoint(id: string, changes: PluginBleEndpointChanges): Promise<PluginBleEndpointRecord | null>;
  deleteEndpoint(id: string): Promise<void>;
  deleteEndpointsOfPlugin(pluginId: string): Promise<void>;
}

export const PLUGIN_BLE_STORE = Symbol.for('attraccess.plugin-system.ble-store');
