import { type ModbusConfiguration, type ModbusConnection, type ModbusMeasurement } from '../../../modbus/model';
import type { DeviceAdapter, Snapshot } from '../runtime';
import { type MeasurementReading, type WriteAdmission } from '../runtime-types';
import { Point } from './adapter.point';
import { CumulativeCounter } from './cumulative-counter';
import { type ModbusTransport, QueuedModbusTransport } from './transports';
export abstract class AdapterContext {
  protected config: ModbusConfiguration = { connections: [], devices: [], profiles: [] };

  protected transports = new Map<string, ModbusTransport>();

  protected counters = new Map<string, CumulativeCounter>();

  protected due = new Map<string, number>();

  protected active = new Set<string>();

  protected generation = 0;

  protected suspended = false;

  protected outputSamples = new Map<string, { result: { value: boolean } | { error: unknown }; expiresAt: number }>();

  constructor(
    protected readonly onboard: DeviceAdapter,
    protected readonly factory: (c: ModbusConnection) => ModbusTransport = (c) => new QueuedModbusTransport(c),
    protected readonly allowedSerialPaths?: readonly string[],
  ) {}
  abstract validate(snapshot: Snapshot): import('../runtime-types').ValidationError[];
  abstract checkAvailability(): Promise<void>;
  abstract configure(snapshot: Snapshot): void;
  abstract prepareConfiguration(snapshot: Snapshot): () => void;
  abstract captureWrite(point: Point, snapshot: Snapshot): (value: boolean) => Promise<void>;
  abstract suspend(): () => void;
  protected abstract resolve(point: Point): {
    binding: import('../../../modbus/model-contracts').ModbusPoint;
    device: import('../../../modbus/model-contracts').ModbusDevice;
    profile: import('../../../modbus/model-contracts').ModbusProfile;
    transport: ModbusTransport;
    connection: ModbusConnection;
  };
  abstract read(point: Point): Promise<boolean | number>;
  abstract readOutput(point: Point): Promise<boolean>;
  abstract measurementSource(point: Point): string;
  abstract readMeasurements(points: Point[]): AsyncGenerator<MeasurementReading>;
  protected abstract measurementValue(key: string, m: ModbusMeasurement, raw: number): number;
  protected abstract acquire(
    key: string,
    m: ModbusMeasurement,
    transport: ModbusTransport,
    unit: number,
  ): Promise<number>;
  abstract shouldPoll(point: Point, now: number): boolean;
  abstract writeMayHaveBeenTransmitted(error: unknown): boolean;
  abstract write(point: Point, value: boolean, admit?: WriteAdmission): Promise<void>;
}
