/**
 * Minimal Web Bluetooth API type definitions (only what the bridge configurator uses).
 * Based on the Web Bluetooth specification; `@types/web-bluetooth` is not a dependency.
 */

declare global {
  interface Navigator {
    bluetooth?: Bluetooth;
  }

  type BluetoothServiceUUID = number | string;

  interface BluetoothLEScanFilter {
    services?: BluetoothServiceUUID[];
    name?: string;
    namePrefix?: string;
  }

  interface RequestDeviceOptions {
    filters?: BluetoothLEScanFilter[];
    optionalServices?: BluetoothServiceUUID[];
    acceptAllDevices?: boolean;
  }

  interface Bluetooth extends EventTarget {
    getAvailability(): Promise<boolean>;
    requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
  }

  interface BluetoothDevice extends EventTarget {
    readonly id: string;
    readonly name?: string;
    readonly gatt?: BluetoothRemoteGATTServer;
  }

  interface BluetoothRemoteGATTServer {
    readonly device: BluetoothDevice;
    readonly connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothRemoteGATTService {
    readonly uuid: string;
    getCharacteristic(characteristic: BluetoothServiceUUID): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    readonly uuid: string;
    readonly value?: DataView;
    writeValueWithResponse(value: BufferSource): Promise<void>;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  }
}

export {};
