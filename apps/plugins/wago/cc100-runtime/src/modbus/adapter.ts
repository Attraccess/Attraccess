// Shared pure configuration model is bundled into both the plugin and standalone runtime.
import type { DeviceAdapter, Snapshot } from '../runtime';
import { AdapterIo } from './adapter-io';
import { Point } from './adapter.point';

/** Routes only explicitly bound Modbus points; onboard behavior stays with its owner. */
export class ModbusDeviceRouter extends AdapterIo implements DeviceAdapter {
  captureWrite(point: Point, snapshot: Snapshot): (value: boolean) => Promise<void> {
    if (!point.modbus) return (value) => this.onboard.write(point, value);
    const captured = new ModbusDeviceRouter(this.onboard, this.factory, this.allowedSerialPaths);
    captured.configure(snapshot);
    const config = JSON.stringify(snapshot.modbus);
    return (value) =>
      JSON.stringify(this.config) === config ? this.write(point, value) : captured.write(point, value);
  }
}

export { CumulativeCounter } from './cumulative-counter';
