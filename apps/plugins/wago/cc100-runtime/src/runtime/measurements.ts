import { encodeMeasurement } from '../../../measurement-contract';
import { acquireMeasurements, measurementErrorCode } from '../modbus/acquisition';
import { RuntimeCommandReservations } from './command-reservations';

export abstract class RuntimeMeasurements extends RuntimeCommandReservations {
  async publishMeasurements(): Promise<void> {
    if (
      this.runtimeUpdateRequired ||
      this.runtimeFailsafePending ||
      this.measurementsPending ||
      this.configurationPending
    )
      return;
    const accepted = this.state.accepted;
    if (!accepted) return;
    this.measurementsPending = true;
    try {
      for await (const reading of acquireMeasurements(accepted.snapshot, this.options.device)) {
        for (const channel of reading.channels) {
          if (
            this.runtimeUpdateRequired ||
            this.runtimeFailsafePending ||
            accepted !== this.state.accepted ||
            this.configurationPending
          )
            return;
          try {
            if (reading.ok === false) throw reading.error;
            const { raw, timestamp } = reading;
            const transform = channel.measurement ?? { unit: 'percent', scale: 1, offset: 0 };
            const measurement = encodeMeasurement(channel.id, raw, transform);
            await this.publishOperational(
              'measurements',
              measurement,
              undefined,
              () =>
                !this.runtimeUpdateRequired &&
                !this.runtimeFailsafePending &&
                accepted === this.state.accepted &&
                !this.configurationPending,
              timestamp,
            );
          } catch (error) {
            await this.publishOperational('faults', {
              channelId: channel.id,
              code: measurementErrorCode(error),
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    } finally {
      this.measurementsPending = false;
    }
  }

  async pollInputs(): Promise<void> {
    // Slow I/O/MQTT must not create an unbounded interval backlog.
    if (this.runtimeUpdateRequired || this.runtimeFailsafePending || this.polling || !this.connected) return;
    this.polling = true;
    try {
      void this.pollModbusOutputs().catch(() => undefined);
      await this.publishState(false);
    } finally {
      this.polling = false;
    }
  }
}
