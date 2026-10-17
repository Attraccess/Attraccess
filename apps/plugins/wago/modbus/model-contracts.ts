import type { EngineeringUnit } from '../measurement-contract';
export type ModbusConnection = { id: string; timeoutMs: number; reconnectMs: number; queueLimit: number } & (
  | { transport: 'tcp'; host: string; port: number }
  | { transport: 'rtu'; path: string; baudRate: number; parity: 'none' | 'even' | 'odd'; stopBits: 1 | 2 }
);
export type RegisterFormat = {
  address: number;
  addressBase: 0 | 1;
  dataType: 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32';
  byteOrder: 'big' | 'little';
  wordOrder: 'big' | 'little';
  scale: number;
  offset: number;
};
export type ModbusMeasurement = RegisterFormat & {
  id: string;
  name: string;
  functionCode: 3 | 4;
  unit: EngineeringUnit;
  kind: 'live' | 'cumulative';
  pollIntervalMs: number;
  /** Explicit rounding in engineering units, before integer MQTT encoding. Absent preserves exact values. */
  decimalPlaces?: number;
  /** Packed decimal digits, decoded before register scaling. Read measurements only. */
  encoding?: 'bcd';
  /** Explicit raw counter modulus; absent means decreases fault. Never inferred from dtype. */
  rollover?: number;
  section?: 'electrical' | 'active-energy' | 'reactive-energy' | 'quadrant-energy' | 'information';
  display?: 'hex' | 'ascii';
  valueLabels?: Record<string, string>;
};
export type ModbusAction = RegisterFormat & {
  id: string;
  name: string;
  functionCode: 5 | 6 | 16;
  onValue: number;
  offValue: number;
};
export type ModbusProfile = {
  id: string;
  name: string;
  version: number;
  measurements: ModbusMeasurement[];
  actions: ModbusAction[];
};
export type ModbusDevice = {
  id: string;
  name: string;
  connectionId: string;
  unitId: number;
  profileId: string;
  profileVersion: number;
  pollIntervalMs?: number;
};
export type ModbusConfiguration = {
  connections: ModbusConnection[];
  devices: ModbusDevice[];
  profiles: ModbusProfile[];
};
export type ModbusPoint = { deviceId: string; measurementId?: string; actionId?: string };
