// Shared pure configuration model is bundled into both the plugin and standalone runtime.
import {
  findProfile,
  modbusHostIdentity,
  type ModbusConfiguration,
  type ModbusConnection,
  type ModbusMeasurement,
  validateModbus,
} from '../../../modbus/model';
import type { DeviceAdapter, Snapshot } from '../runtime';
import { type WriteAdmission, WriteAdmissionError } from '../runtime-types';
import { decodeRaw, readPdu, writePdu } from './protocol';
import { type ModbusTransport, ModbusTransportError, QueuedModbusTransport } from './transports';

type Point = Snapshot['physicalPoints'][number];
export class CumulativeCounter {
  private previous?: number;
  private total = 0;
  update(raw: number, modulus?: number): number {
    if (!Number.isFinite(raw) || raw < 0 || (modulus !== undefined && raw >= modulus))
      throw new Error('invalid cumulative counter');
    if (this.previous === undefined) this.total = raw;
    else if (raw < this.previous) {
      if (modulus === undefined) throw new Error('cumulative counter decreased without documented rollover');
      // Accept only a boundary crossing; a reset in the middle of the range remains a fault.
      if (this.previous < modulus * 0.9 || raw > modulus * 0.1) throw new Error('counter reset is not a rollover');
      this.total += modulus - this.previous + raw;
    } else this.total += raw - this.previous;
    this.previous = raw;
    if (!Number.isFinite(this.total) || Math.abs(this.total) > Number.MAX_SAFE_INTEGER)
      throw new Error('cumulative counter overflow');
    return this.total;
  }
}

/** Routes only explicitly bound Modbus points; onboard behavior stays with its owner. */
export class ModbusDeviceRouter implements DeviceAdapter {
  private config: ModbusConfiguration = { connections: [], devices: [], profiles: [] };
  private transports = new Map<string, ModbusTransport>();
  private counters = new Map<string, CumulativeCounter>();
  private due = new Map<string, number>();
  private active = new Set<string>();
  private generation = 0;
  private suspended = false;
  private outputSamples = new Map<string, { value: boolean; expiresAt: number }>();
  constructor(
    private readonly onboard: DeviceAdapter,
    private readonly factory: (c: ModbusConnection) => ModbusTransport = (c) => new QueuedModbusTransport(c),
    private readonly allowedSerialPaths?: readonly string[],
  ) {}
  validate(snapshot: Snapshot) {
    const points = snapshot.physicalPoints.filter((point) => !point.modbus);
    const ids = new Set(points.map((point) => point.id));
    const errors =
      this.onboard.validate?.({
        ...snapshot,
        modbus: undefined,
        physicalPoints: points,
        logicalChannels: snapshot.logicalChannels.filter((channel) => ids.has(channel.physicalPointId)),
      }) ?? [];
    snapshot.modbus?.connections.forEach((connection, index) => {
      if (
        connection.transport === 'rtu' &&
        this.allowedSerialPaths &&
        !this.allowedSerialPaths.includes(connection.path)
      ) {
        errors.push({
          path: `snapshot.modbus.connections[${index}].path`,
          code: 'unsupported_serial_path',
          message: `This runtime exposes ${this.allowedSerialPaths.join(', ')} for Modbus RTU`,
        });
      }
    });
    return errors;
  }
  checkAvailability(): Promise<void> {
    return this.onboard.checkAvailability?.() ?? Promise.resolve();
  }
  configure(snapshot: Snapshot): void {
    this.prepareConfiguration(snapshot)();
  }
  /** Build the next immutable routing table without changing active I/O or history. */
  prepareConfiguration(snapshot: Snapshot): () => void {
    const config = structuredClone(snapshot.modbus ?? { connections: [], devices: [], profiles: [] });
    const errors = validateModbus(config);
    if (errors.length) throw new Error(errors.map((e) => `${e.path}: ${e.message}`).join('; '));
    // Keep bus queues across revisions so reconfiguration cannot overlap in-flight serial I/O.
    const next = new Map<string, ModbusTransport>();
    for (const c of config.connections) {
      const old = this.config.connections.find((entry) => entry.id === c.id);
      const transport = old && JSON.stringify(old) === JSON.stringify(c) ? this.transports.get(c.id) : undefined;
      next.set(c.id, transport ?? this.factory(c));
    }
    const sources = new Set<string>();
    for (const device of config.devices) {
      const connection = config.connections.find((c) => c.id === device.connectionId);
      const profile = findProfile(config, device);
      if (!connection || !profile) throw new Error('unconfigured Modbus device');
      for (const measurement of profile.measurements)
        sources.add(sourceIdentity(connection, device.unitId, measurement));
    }
    return () => {
      this.generation++;
      this.config = config;
      this.transports = next;
      this.outputSamples.clear();
      // Names, polling intervals and profile/revision versions are not physical source identity.
      for (const key of this.counters.keys()) if (!sources.has(key)) this.counters.delete(key);
      for (const key of this.due.keys()) if (!key.startsWith('onboard:') && !sources.has(key)) this.due.delete(key);
    };
  }
  suspend(): () => void {
    this.suspended = true;
    this.generation++; // Also cancels requests already waiting on a shared bus.
    return () => {
      this.suspended = false;
    };
  }
  private resolve(point: Point) {
    const binding = point.modbus;
    const device = this.config.devices.find((d) => d.id === binding?.deviceId);
    const profile = device && findProfile(this.config, device);
    const transport = device && this.transports.get(device.connectionId);
    const connection = device && this.config.connections.find((c) => c.id === device.connectionId);
    if (!binding || !device || !profile || !transport || !connection) throw new Error('unconfigured Modbus point');
    return { binding, device, profile, transport, connection };
  }
  async read(point: Point): Promise<boolean | number> {
    if (this.suspended) throw new Error('Modbus configuration persistence in progress');
    if (!point.modbus) {
      if (point.hardwareProfile !== '751-9301')
        throw new Error('meter requires explicit Modbus device and measurement');
      return this.onboard.read(point);
    }
    const { binding, device, profile, transport } = this.resolve(point);
    const measurement = profile.measurements.find((m) => m.id === binding.measurementId);
    if (!measurement) throw new Error('point has no named measurement');
    return this.acquire(this.measurementSource(point), measurement, transport, device.unitId);
  }
  async readOutput(point: Point): Promise<boolean> {
    if (!point.modbus) return Boolean(await this.onboard.read(point));
    if (this.suspended) throw new Error('Modbus configuration persistence in progress');
    const { binding, device, profile, transport } = this.resolve(point);
    const action = profile.actions.find((action) => action.id === binding.actionId);
    if (!action) throw new Error('point has no named action');
    const cached = this.outputSamples.get(point.id);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const generation = this.generation;
    const bytes = await transport.request(device.unitId, readPdu(action.functionCode === 5 ? 1 : 3, action), () => generation === this.generation);
    if (generation !== this.generation) throw new Error('Modbus configuration changed during acquisition');
    const raw = action.functionCode === 5 ? Number(Boolean(bytes[0] & 1)) : decodeRaw(bytes, action);
    const physical = raw * action.scale + action.offset;
    if (physical !== action.onValue && physical !== action.offValue) throw new Error('switch register has an unknown state');
    const value = physical === action.onValue;
    this.outputSamples.set(point.id, { value, expiresAt: Date.now() + (device.pollIntervalMs ?? 5000) });
    return value;
  }
  measurementSource(point: Point): string {
    if (!point.modbus) return `onboard:${point.id}`;
    const { device, profile, binding, connection } = this.resolve(point);
    const measurement = profile.measurements.find((m) => m.id === binding.measurementId);
    if (!measurement) throw new Error('point has no named measurement');
    return sourceIdentity(connection, device.unitId, measurement);
  }
  private async acquire(key: string, m: ModbusMeasurement, transport: ModbusTransport, unit: number): Promise<number> {
    if (this.active.has(key)) throw new Error('Modbus acquisition already in progress');
    this.active.add(key);
    const generation = this.generation;
    try {
      const raw = decodeRaw(
        await transport.request(unit, readPdu(m.functionCode, m), () => generation === this.generation),
        m,
      );
      if (generation !== this.generation) throw new Error('Modbus configuration changed during acquisition');
      let value = raw;
      if (m.kind === 'cumulative') {
        let counter = this.counters.get(key);
        if (!counter) {
          counter = new CumulativeCounter();
          this.counters.set(key, counter);
        }
        value = counter.update(raw, m.rollover);
      }
      const scaled = value * m.scale + m.offset;
      if (!Number.isFinite(scaled)) throw new Error('Modbus scaling overflow');
      // Float registers carry binary approximation noise. Only profiles that
      // explicitly declare a precision may round; legacy/custom exact maps keep
      // their original semantics and the MQTT encoder remains strict.
      return m.decimalPlaces === undefined ? scaled : Number(scaled.toFixed(m.decimalPlaces));
    } finally {
      this.active.delete(key);
    }
  }
  shouldPoll(point: Point, now: number): boolean {
    if (!point.modbus) {
      const key = `onboard:${point.id}`;
      if (now < (this.due.get(key) ?? 0)) return false;
      this.due.set(key, now + 5000);
      return true;
    }
    const { binding, profile, device } = this.resolve(point);
    const m = profile.measurements.find((entry) => entry.id === binding.measurementId);
    if (!m) return false;
    const key = this.measurementSource(point);
    if (this.active.has(key) || now < (this.due.get(key) ?? 0)) return false;
    this.due.set(key, now + (device.pollIntervalMs ?? m.pollIntervalMs));
    return true;
  }
  writeMayHaveBeenTransmitted(error: unknown): boolean {
    if (error instanceof WriteAdmissionError) return false;
    return !(
      error instanceof ModbusTransportError &&
      ['modbus_queue_full', 'modbus_configuration_changed'].includes(error.code)
    );
  }
  async write(point: Point, value: boolean, admit?: WriteAdmission): Promise<void> {
    this.outputSamples.delete(point.id);
    admit?.();
    if (this.suspended) throw new Error('Modbus configuration persistence in progress');
    if (!point.modbus) {
      if (point.hardwareProfile !== '751-9301') throw new Error('meter outputs require an explicit custom action');
      return this.onboard.write(point, value, admit);
    }
    const { binding, device, profile, transport } = this.resolve(point);
    const action = profile.actions.find((a) => a.id === binding.actionId);
    if (!action) throw new Error('read-only profile or unknown named action');
    const generation = this.generation;
    await transport.request(
      device.unitId,
      writePdu(action.functionCode, action, value ? action.onValue : action.offValue),
      Object.assign(
        () => {
          admit?.();
          return generation === this.generation;
        },
        { expiresAt: admit?.expiresAt },
      ),
    );
    this.outputSamples.delete(point.id);
  }
}

function sourceIdentity(connection: ModbusConnection, unit: number, m: ModbusMeasurement): string {
  const endpoint =
    connection.transport === 'tcp'
      ? ['tcp', modbusHostIdentity(connection.host), connection.port]
      : ['rtu', connection.path, connection.baudRate, connection.parity, connection.stopBits];
  return JSON.stringify([
    endpoint,
    unit,
    m.functionCode,
    m.address - m.addressBase,
    m.dataType,
    m.byteOrder,
    m.wordOrder,
    m.scale,
    m.offset,
    m.unit,
    m.kind,
    m.rollover ?? null,
    m.decimalPlaces ?? null,
  ]);
}
