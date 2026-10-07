import { type ModbusMeasurement, registerCount, wireAddress } from '../../../modbus/model';
import { type MeasurementReading } from '../runtime-types';
import { AdapterMeasurementAcquisition } from './adapter-measurement-acquisition';
import { Point } from './adapter.point';
import { decodeRaw, ModbusException } from './protocol';
import { type ModbusTransport } from './transports';

export abstract class AdapterMeasurementBatching extends AdapterMeasurementAcquisition {
  async *readMeasurements(points: Point[]): AsyncGenerator<MeasurementReading> {
    const generation = this.generation;
    const grouped = new Map<
      string,
      Array<{ point: Point; measurement: ModbusMeasurement; transport: ModbusTransport; unit: number }>
    >();
    for (const point of points) {
      if (!point.modbus) {
        try {
          yield { pointId: point.id, ok: true, raw: await this.read(point), timestamp: new Date().toISOString() };
        } catch (error) {
          yield { pointId: point.id, ok: false, error };
        }
        continue;
      }
      try {
        const { binding, device, profile, transport, connection } = this.resolve(point);
        const measurement = profile.measurements.find((m) => m.id === binding.measurementId);
        if (!measurement) throw new Error('point has no named measurement');
        const key = JSON.stringify([connection.id, device.unitId, measurement.functionCode]);
        const entries = grouped.get(key) ?? [];
        entries.push({ point, measurement, transport, unit: device.unitId });
        grouped.set(key, entries);
      } catch (error) {
        yield { pointId: point.id, ok: false, error };
      }
    }
    for (const entries of grouped.values()) {
      entries.sort((a, b) => wireAddress(a.measurement) - wireAddress(b.measurement));
      let index = 0;
      while (index < entries.length) {
        const first = entries[index];
        const start = wireAddress(first.measurement);
        let end = start + registerCount(first.measurement);
        let limit = index + 1;
        while (limit < entries.length) {
          const m = entries[limit].measurement;
          const address = wireAddress(m),
            nextEnd = address + registerCount(m);
          if (address > end || Math.max(end, nextEnd) - start > 120) break;
          end = Math.max(end, nextEnd);
          limit++;
        }
        const block = entries.slice(index, limit);
        index = limit;
        try {
          if (this.suspended || generation !== this.generation)
            throw new Error('Modbus configuration changed before acquisition');
          const pdu = Buffer.alloc(5);
          pdu[0] = first.measurement.functionCode;
          pdu.writeUInt16BE(start, 1);
          pdu.writeUInt16BE(end - start, 3);
          const bytes = await first.transport.request(
            first.unit,
            pdu,
            () => !this.suspended && generation === this.generation,
          );
          if (generation !== this.generation || this.suspended)
            throw new Error('Modbus configuration changed during acquisition');
          if (bytes.length !== (end - start) * 2) throw new Error('Modbus bulk register width mismatch');
          const timestamp = new Date().toISOString();
          for (const { point, measurement } of block) {
            try {
              const offset = (wireAddress(measurement) - start) * 2;
              const raw = decodeRaw(bytes.subarray(offset, offset + registerCount(measurement) * 2), measurement);
              yield {
                pointId: point.id,
                ok: true,
                raw: this.measurementValue(this.measurementSource(point), measurement, raw),
                timestamp,
              };
            } catch (error) {
              yield { pointId: point.id, ok: false, error };
            }
          }
        } catch (error) {
          // A valid Modbus exception proves no ambiguous reply is pending. Isolate
          // model/firmware-specific unavailable fields; never retry an RTU timeout.
          if (error instanceof ModbusException && [2, 3].includes(error.exceptionCode) && block.length > 1) {
            for (const { point } of block) {
              try {
                yield { pointId: point.id, ok: true, raw: await this.read(point), timestamp: new Date().toISOString() };
              } catch (failure) {
                yield { pointId: point.id, ok: false, error: failure };
              }
            }
          } else for (const { point } of block) yield { pointId: point.id, ok: false, error };
        }
      }
    }
  }
}
