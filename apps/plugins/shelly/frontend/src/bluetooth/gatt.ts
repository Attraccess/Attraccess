// Shelly mOS RPC over GATT. The service UUIDs spell their purpose in ASCII
// ("_mOS_RPC_data___", "_mOS_RPC_tx_ctl_", …). Free of DOM types so the
// protocol can be unit-tested against a fake characteristic triple.

export const SHELLY_RPC_SERVICE = '5f6d4f53-5f52-5043-5f53-56435f49445f';
export const SHELLY_RPC_DATA = '5f6d4f53-5f52-5043-5f64-6174615f5f5f';
export const SHELLY_RPC_TX_CONTROL = '5f6d4f53-5f52-5043-5f74-785f63746c5f';
export const SHELLY_RPC_RX_CONTROL = '5f6d4f53-5f52-5043-5f72-785f63746c5f';

/** The slice of `BluetoothRemoteGATTCharacteristic` the RPC client needs. */
export interface GattCharacteristic {
  readValue(): Promise<DataView>;
  writeValue(value: Uint8Array): Promise<void>;
}

export interface RpcChannel {
  data: GattCharacteristic;
  txControl: GattCharacteristic;
  rxControl: GattCharacteristic;
}
