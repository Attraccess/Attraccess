/** A logical BLE endpoint owned by exactly one backend plugin: a reader, a device address and a profile. */
export interface PluginBleEndpointRecord {
  id: string;
  pluginId: string;
  readerId: number;
  address: string;
  addressType: 'public' | 'random';
  profileId: string;
  label: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewPluginBleEndpoint = Pick<
  PluginBleEndpointRecord,
  'id' | 'pluginId' | 'readerId' | 'address' | 'addressType' | 'profileId'
> & { label?: string | null };

/** The endpoint fields a plugin may change. */
export type PluginBleEndpointChanges = Partial<
  Pick<PluginBleEndpointRecord, 'readerId' | 'address' | 'addressType' | 'label'>
>;

/** What the BLE host needs to know about a reader. */
export interface PluginBleReaderAccess {
  id: number;
  name: string;
  /** Whether plugins may use this reader's Bluetooth radio. */
  allowPluginBle: boolean;
}
