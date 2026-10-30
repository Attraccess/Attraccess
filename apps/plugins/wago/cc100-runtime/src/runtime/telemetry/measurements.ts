import { encodeMeasurement, type Measurement } from '../../../../measurement-contract';
import { acquireMeasurements, measurementErrorCode } from '../../modbus/routing/acquisition';
import { boundFaultText } from '../bounded';
import { RuntimeCommandReservations } from '../commands/reservations';
import { type RuntimeState } from '../types';

/**
 * An unchanged reading is re-published at least this often, so a sample is at most this old.
 * A device polled less often than this publishes every acquisition.
 */
export const MAX_SILENCE_MS = 30_000;

type AcceptedConfiguration = NonNullable<RuntimeState['accepted']>;

/** A negative age means the wall clock stepped back; treat it as expired so publication resumes. */
const withinSilence = (ageMs: number) => ageMs >= 0 && ageMs < MAX_SILENCE_MS;

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
    const configurationKey = JSON.stringify([accepted.revision, accepted.contentHash]);
    if (configurationKey !== this.measurementConfigurationKey) {
      this.measurementConfigurationKey = configurationKey;
      this.resyncMeasurements();
    }
    this.measurementsPending = true;
    const isCurrent = () =>
      !this.runtimeUpdateRequired &&
      !this.runtimeFailsafePending &&
      accepted === this.state.accepted &&
      !this.configurationPending;
    try {
      for await (const reading of acquireMeasurements(accepted.snapshot, this.options.device)) {
        for (const channel of reading.channels) {
          if (!isCurrent()) return;
          try {
            if (reading.ok === false) throw reading.error;
            const { raw, timestamp } = reading;
            const transform = channel.measurement ?? { unit: 'percent', scale: 1, offset: 0 };
            const measurement = encodeMeasurement(channel.id, raw, transform);
            await this.publishMeasurement(accepted, measurement, timestamp, isCurrent);
          } catch (error) {
            await this.publishMeasurementFault(channel.id, error, isCurrent);
          }
        }
      }
    } finally {
      this.measurementsPending = false;
    }
  }

  /** On-change publication with a keyframe every MAX_SILENCE_MS; the wire format is unchanged. */
  private async publishMeasurement(
    accepted: AcceptedConfiguration,
    measurement: Measurement,
    timestamp: string,
    isCurrent: () => boolean,
  ): Promise<void> {
    const acquiredAt = Date.parse(timestamp);
    this.measurementFaultRecords.delete(measurement.channelId);
    const record = this.measurementRecords.get(measurement.channelId);
    if (
      record &&
      record.value === measurement.value &&
      record.unit === measurement.unit &&
      record.kind === measurement.kind &&
      withinSilence(acquiredAt - record.reportedAt)
    )
      return;
    const generation = this.measurementGeneration;
    let sent = false;
    await this.publishOperational('measurements', measurement, undefined, () => (sent = isCurrent()), timestamp);
    // Only a broker-accepted, still-current sample suppresses its successors; a failed one is retried.
    // A sample taken at or before the last resync state (a bulk block yielded while an earlier publish
    // waited) is refused by the server, so it must not suppress the next sweep either.
    if (
      sent &&
      isCurrent() &&
      accepted === this.state.accepted &&
      generation === this.measurementGeneration &&
      acquiredAt > this.measurementsAcquiredAfter
    )
      this.measurementRecords.set(measurement.channelId, {
        value: measurement.value,
        unit: measurement.unit,
        kind: measurement.kind,
        reportedAt: acquiredAt,
      });
  }

  /** A repeated (channel, code) fault is suppressed until a good sample or MAX_SILENCE_MS passes. */
  private async publishMeasurementFault(channelId: string, error: unknown, isCurrent: () => boolean): Promise<void> {
    const code = measurementErrorCode(error);
    // The next good sample must be published even when its value did not change.
    this.measurementRecords.delete(channelId);
    const now = Date.now();
    const record = this.measurementFaultRecords.get(channelId);
    if (record?.code === code && withinSilence(now - record.reportedAt)) return;
    const generation = this.measurementGeneration;
    await this.publishOperational('faults', {
      channelId,
      code,
      message: boundFaultText(error instanceof Error ? error.message : String(error)),
    });
    if (isCurrent() && generation === this.measurementGeneration)
      this.measurementFaultRecords.set(channelId, { code, reportedAt: now });
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
