import { findProfile, validateModbus } from '../../../modbus/model';
import type { Snapshot } from '../runtime';
import { AdapterContext } from './adapter-context';
import { Point } from './adapter.point';
import { sourceIdentity } from './adapter.source-identity';
import { type ModbusTransport } from './transports';

export abstract class AdapterConfiguration extends AdapterContext {
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

  protected resolve(point: Point) {
    const binding = point.modbus;
    const device = this.config.devices.find((d) => d.id === binding?.deviceId);
    const profile = device && findProfile(this.config, device);
    const transport = device && this.transports.get(device.connectionId);
    const connection = device && this.config.connections.find((c) => c.id === device.connectionId);
    if (!binding || !device || !profile || !transport || !connection) throw new Error('unconfigured Modbus point');
    return { binding, device, profile, transport, connection };
  }
}
