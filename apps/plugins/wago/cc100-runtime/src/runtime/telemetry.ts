import { CAPABILITIES } from '../runtime-protocol';
import { RuntimeStatePublication } from './state-publication';
import { type ValidationError } from './types';
import { runtimeVersion } from '../../manifest.json';

export abstract class RuntimeTelemetry extends RuntimeStatePublication {
  public async publishHeartbeat(ignoreStatePublicationFailure = false): Promise<void> {
    if (this.heartbeatPublication) {
      this.heartbeatRefreshRequested = true;
      return this.heartbeatPublication;
    }
    this.heartbeatPublication = (async () => {
      do {
        this.heartbeatRefreshRequested = false;
        if (this.runtimeUpdateRequired || this.runtimeFailsafePending) await this.applyRuntimeUpdateFailsafe();
        try {
          await this.publishOperational('heartbeat', {
            hardwareId: this.options.hardwareId,
            pairingCode: this.options.pairingCode,
            protocolVersion: '1.0.0',
            runtimeVersion,
            ...(this.options.runtimeImageId ? { runtimeImageId: this.options.runtimeImageId } : {}),
            runtimePolicyToken: this.runtimePolicyToken,
            capabilities:
              this.credentialRotationSubscribed && this.state.credentials?.credentialEpoch
                ? CAPABILITIES
                : CAPABILITIES.filter((value) => value !== 'credential-rotation-v1'),
          });
        } catch (error) {
          if (!ignoreStatePublicationFailure) throw error;
        }
        try {
          await this.publishState();
        } catch (error) {
          // State telemetry reserves a durable sequence. A read-only state volume
          // must not prevent startup or disconnect safety policies from running.
          if (!ignoreStatePublicationFailure) throw error;
        }
      } while (this.heartbeatRefreshRequested);
    })().finally(() => {
      this.heartbeatPublication = undefined;
    });
    return this.heartbeatPublication;
  }

  protected publishReport(revision: number, contentHash: string, errors: ValidationError[]): Promise<void> {
    return this.options.transport.publish(
      this.topic('configuration/reported'),
      { revision, contentHash, errors },
      { retain: true },
    );
  }

  protected reportRejected(revision: number, contentHash: string, errors: ValidationError[]): Promise<void> {
    return this.publishReport(revision, contentHash, errors);
  }

  protected publishFault(channelId: string, error: unknown): Promise<void> {
    const fault =
      error && typeof error === 'object' && 'code' in error && 'message' in error
        ? (error as { code: string; message: string })
        : {
            code: 'device_write_failed',
            message: error instanceof Error ? error.message : String(error),
          };
    const key = JSON.stringify([channelId, fault.code]);
    // Repeated failed reads/shutoff retries must not accumulate pending MQTT
    // publications. Retained readiness still carries every current read error.
    if (this.pendingFaults.has(key) || this.pendingFaults.size >= 100) return Promise.resolve();
    this.pendingFaults.add(key);
    return this.publishOperational('faults', { channelId, ...fault }).finally(() => {
      this.pendingFaults.delete(key);
    });
  }

  protected acknowledge(
    id: string,
    status: 'accepted' | 'duplicate' | 'rejected',
    error?: string,
    code?: string,
  ): Promise<void> {
    return this.publishOperational('acknowledgements', { id, status, error, code });
  }

  protected publishOperational(
    suffix: string,
    payload: Record<string, unknown>,
    options?: { retain?: boolean },
    isCurrent = () => true,
    timestamp?: string,
  ): Promise<void> {
    const reservation = this.operationalPublications.then(async () => {
      // Reserve before publishing. Other state saves retain this high-water mark;
      // restart skips unused reservations rather than replaying sequence numbers.
      const nextSequence = (this.categorySequences.get(suffix) ?? this.initialSequence) + 1;
      if (nextSequence > this.reservedSequence) {
        const reserved = this.sequence + 100;
        await this.queueStateUpdate(async () => {
          await this.options.store.save({ ...this.state, sequence: reserved });
          this.state.sequence = reserved;
          this.reservedSequence = reserved;
        });
      }
      this.categorySequences.set(suffix, nextSequence);
      this.sequence = Math.max(this.sequence, nextSequence);
      return { timestamp: timestamp ?? new Date().toISOString(), sequence: nextSequence, streamId: this.streamId };
    });
    // Serialize sequence allocation, not broker acknowledgements: an in-flight
    // retained-state publish must not hold up a feedback fault or command ack.
    this.operationalPublications = reservation.then(
      () => undefined,
      () => undefined,
    );
    return reservation.then((metadata) =>
      isCurrent()
        ? this.options.transport.publish(
            this.topic(suffix),
            {
              ...payload,
              ...metadata,
            },
            options,
          )
        : undefined,
    );
  }

  protected saveState(): Promise<void> {
    return this.queueStateUpdate(() => this.options.store.save(this.state));
  }

  protected queueStateUpdate(update: () => Promise<void>): Promise<void> {
    const queued = this.statePersistence.then(update);
    this.statePersistence = queued.catch(() => undefined);
    return queued;
  }

  protected topic(suffix: string): string {
    return `${this.options.prefix.replace(/^\/+|\/+$/g, '')}/v1/controllers/${this.options.hardwareId}/${suffix}`;
  }

  protected desiredTopic(): string {
    return this.topic('configuration/desired');
  }

  protected commandTopic(): string {
    return this.topic('commands');
  }
}
