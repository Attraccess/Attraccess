import { type ModbusMeasurement } from '../../../modbus/model';
import { AdapterConfiguration } from './adapter-configuration';
import { Point } from './adapter.point';
import { sourceIdentity } from './adapter.source-identity';
import { CumulativeCounter } from './cumulative-counter';
import { decodeRaw, readPdu } from './protocol';
import { type ModbusTransport } from './transports';

export abstract class AdapterMeasurementAcquisition extends AdapterConfiguration {
  measurementSource(point: Point): string {
    if (!point.modbus) return `onboard:${point.id}`;
    const { device, profile, binding, connection } = this.resolve(point);
    const measurement = profile.measurements.find((m) => m.id === binding.measurementId);
    if (!measurement) throw new Error('point has no named measurement');
    return sourceIdentity(connection, device.unitId, measurement);
  }

  protected measurementValue(key: string, m: ModbusMeasurement, raw: number): number {
    const digits = m.encoding === 'bcd' ? raw.toString(16) : null;
    if (digits !== null && !/^\d+$/.test(digits)) throw new Error('invalid packed decimal register');
    const decoded = digits === null ? raw : Number(digits);
    let value = decoded;
    if (m.kind === 'cumulative') {
      let counter = this.counters.get(key);
      if (!counter) {
        counter = new CumulativeCounter();
        this.counters.set(key, counter);
      }
      value = counter.update(decoded, m.rollover);
    }
    const scaled = value * m.scale + m.offset;
    if (!Number.isFinite(scaled)) throw new Error('Modbus scaling overflow');
    return m.decimalPlaces === undefined ? scaled : Number(scaled.toFixed(m.decimalPlaces));
  }

  protected async acquire(
    key: string,
    m: ModbusMeasurement,
    transport: ModbusTransport,
    unit: number,
  ): Promise<number> {
    if (this.active.has(key)) throw new Error('Modbus acquisition already in progress');
    this.active.add(key);
    const generation = this.generation;
    try {
      const raw = decodeRaw(
        await transport.request(unit, readPdu(m.functionCode, m), () => generation === this.generation),
        m,
      );
      if (generation !== this.generation) throw new Error('Modbus configuration changed during acquisition');
      // Float registers carry binary approximation noise. Only profiles that
      // explicitly declare a precision may round; legacy/custom exact maps keep
      // their original semantics and the MQTT encoder remains strict.
      return this.measurementValue(key, m, raw);
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
}
