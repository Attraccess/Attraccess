import { RuntimeMeasurements } from './measurements';
import { type Snapshot } from '../types';

export abstract class RuntimeModbusOutputPolling extends RuntimeMeasurements {
  /** One acquisition per bus, across at most the 64 validated connections. */
  async pollModbusOutputs(): Promise<void> {
    if (this.runtimeUpdateRequired || this.runtimeFailsafePending) return;
    const accepted = this.state.accepted;
    const readOutput = this.options.device.readOutput?.bind(this.options.device);
    if (!this.connected || !accepted || !readOutput) return;
    const buses = new Map<
      string,
      Array<{
        channel: Snapshot['logicalChannels'][number];
        point: Snapshot['physicalPoints'][number];
        pollIntervalMs: number;
      }>
    >();
    for (const channel of accepted.snapshot.logicalChannels) {
      if (!channel.capabilities.includes('output')) continue;
      const point = accepted.snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
      if (!point?.modbus) continue;
      const device = accepted.snapshot.modbus?.devices.find((item) => item.id === point.modbus?.deviceId);
      if (!device) continue;
      const bus = buses.get(device.connectionId) ?? [];
      bus.push({ channel, point, pollIntervalMs: device.pollIntervalMs ?? 5000 });
      buses.set(device.connectionId, bus);
    }
    const acquisitions: Promise<void>[] = [];
    let acquired = false;
    for (const [connectionId, channels] of buses) {
      if (this.pollingModbusOutputConnections.has(connectionId)) continue;
      // Configuration changes must not accumulate additional work while old
      // transport requests are still unwinding.
      if (this.pollingModbusOutputConnections.size >= 64) break;
      this.pollingModbusOutputConnections.add(connectionId);
      acquisitions.push(
        (async () => {
          for (const { channel, point, pollIntervalMs } of channels) {
            if (accepted !== this.state.accepted || !this.connected) return;
            const sample = this.modbusOutputSamples.get(channel.id);
            if (
              sample?.revision === accepted.revision &&
              Date.now() - sample.acquiredAt < pollIntervalMs &&
              sample.commanded === this.state.outputs[channel.id]
            )
              continue;
            const commanded = this.state.outputs[channel.id];
            acquired = true;
            try {
              const value = await readOutput(point);
              if (typeof value !== 'boolean') throw new Error('digital state requires a boolean value');
              if (accepted !== this.state.accepted) return;
              this.modbusOutputSamples.set(channel.id, {
                revision: accepted.revision,
                value,
                commanded,
                acquiredAt: Date.now(),
              });
            } catch (error) {
              if (accepted !== this.state.accepted) return;
              // Replace the old success with the failure; heartbeats must retain the fault.
              this.modbusOutputSamples.set(channel.id, {
                revision: accepted.revision,
                commanded,
                acquiredAt: Date.now(),
                error: error instanceof Error ? error.message : String(error),
              });
            }
            // A healthy connection must be visible before any other bus completes.
            void this.publishState(false).catch(() => undefined);
          }
        })().finally(() => this.pollingModbusOutputConnections.delete(connectionId)),
      );
    }
    await Promise.all(acquisitions);
    if (acquired) await this.publishState(false);
  }
}
