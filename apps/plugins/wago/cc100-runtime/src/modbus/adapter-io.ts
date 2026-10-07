import { type WriteAdmission, WriteAdmissionError } from '../runtime-types';
import { AdapterMeasurementBatching } from './adapter-measurement-batching';
import { Point } from './adapter.point';
import { decodeRaw, encode, readPdu, writePdu } from './protocol';
import { ModbusTransportError } from './transports';

export abstract class AdapterIo extends AdapterMeasurementBatching {
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
    if (cached && cached.expiresAt > Date.now()) {
      if ('error' in cached.result) throw cached.result.error;
      return cached.result.value;
    }
    const generation = this.generation;
    const expiresAt = Date.now() + (device.pollIntervalMs ?? 5000);
    try {
      const bytes = await transport.request(
        device.unitId,
        readPdu(action.functionCode === 5 ? 1 : 3, action),
        () => generation === this.generation,
      );
      if (generation !== this.generation) throw new Error('Modbus configuration changed during acquisition');
      const raw = action.functionCode === 5 ? Number(Boolean(bytes[0] & 1)) : decodeRaw(bytes, action);
      // Compare the actual wire representation, including float32 rounding and
      // register scale/offset, with exactly what a command would write.
      const on = action.functionCode === 5 ? action.onValue : decodeRaw(encode(action.onValue, action), action);
      const off = action.functionCode === 5 ? action.offValue : decodeRaw(encode(action.offValue, action), action);
      if (on === off) throw new Error('switch register has indistinguishable on/off values');
      if (raw !== on && raw !== off) throw new Error('switch register has an unknown state');
      const value = raw === on;
      this.outputSamples.set(point.id, { result: { value }, expiresAt });
      return value;
    } catch (error) {
      if (generation === this.generation) this.outputSamples.set(point.id, { result: { error }, expiresAt });
      throw error;
    }
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
