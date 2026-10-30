import { randomUUID } from 'node:crypto';
// The standalone runtime bundles the plugin-owned measurement contract.
// The API and standalone runtime enforce the same configured output behavior.
import { validateDesired } from './runtime/configuration/validation';
import { MAX_COMMAND_BYTES, MAX_DESIRED_BYTES } from './runtime/limits';
import { RuntimeTelemetry } from './runtime/telemetry/telemetry';

export { hash, PROTOCOL_VERSION, validateDesired, validateSnapshot } from './runtime/configuration/validation';
export { MAX_PENDING_CHANNEL_WRITES } from './outputs/controller';
export type { DeviceAdapter, RuntimeState, Snapshot, Transport, ValidationError } from './runtime/types';
export { JsonStateStore } from './runtime/state-store';

export class WagoRuntime extends RuntimeTelemetry {
  public async start(activateConnectionHandling?: () => Promise<void>): Promise<void> {
    // Startup can be interrupted by a missing MQTT acknowledgement. Retry only
    // unfinished subscriptions, preserving the loaded state and sequence counters.
    if (!this.loaded) {
      this.state = await this.options.store.load();
      this.sequence = this.state.sequence ?? 0;
      this.reservedSequence = this.sequence;
      this.initialSequence = 0;
      if (this.state.accepted) {
        // Keep operating configurations written by older runtime versions alive. New
        // desired configurations reject invalid measurement metadata, but a persisted
        // legacy transform is handled by the measurement fault path instead of making
        // the controller unavailable after a restart.
        // Limits only gate new revisions, so they are not part of this check.
        const errors = validateDesired({ protocolVersion: 1, ...this.state.accepted }).filter(
          ({ code }) => code !== 'invalid_measurement',
        );
        if (errors.length) throw new Error('persisted configuration is invalid');
        this.options.device.configure?.(this.state.accepted.snapshot);
      }
      this.outputs.recoverPulses();
      this.loaded = true;
    }
    if (this.runtimeUpdateRequired || this.runtimeFailsafePending) await this.applyRuntimeUpdateFailsafe();
    else await this.outputs.applyDisconnectPolicies(this.connected);
    if (!this.desiredSubscribed) {
      // Desired messages are admitted concurrently on purpose: a runtime-update message must raise its
      // failsafe while earlier configurations still wait for the update lock, so they are skipped.
      // Each one is decoded only under that lock, so at most one parsed configuration is held.
      await this.options.transport.subscribe(this.desiredTopic(), (payload) => this.receiveDesired(payload), {
        maxBytes: MAX_DESIRED_BYTES,
      });
      this.desiredSubscribed = true;
    }
    if (!this.commandsSubscribed) {
      await this.options.transport.subscribe(
        this.commandTopic(),
        (payload, slot) => this.receiveCommand(payload, slot),
        {
          maxBytes: MAX_COMMAND_BYTES,
        },
      );
      this.commandsSubscribed = true;
    }
    await this.retryCredentialRotationSubscription();
    await activateConnectionHandling?.();
    await this.publishHeartbeat(true);
  }

  async setConnected(connected: boolean): Promise<void> {
    if (!connected && this.options.runtimeImageId) {
      this.runtimePolicyToken = randomUUID();
      this.runtimeUpdateRequired = true;
    }
    if (!this.loaded) {
      this.connected = connected;
      return;
    }
    const transition = this.connectionPolicies.then(async () => {
      this.connected = connected;
      if (this.runtimeUpdateRequired || this.runtimeFailsafePending) await this.applyRuntimeUpdateFailsafe();
      else await this.outputs.applyDisconnectPolicies(connected);
    });
    this.connectionPolicies = transition.catch(() => undefined);
    await transition;
    // Connection callbacks must complete after the hardware policy. Otherwise a
    // stalled MQTT state publish can delay a following disconnect shutdown.
    this.requestStatePublication();
    if (connected && this.options.runtimeImageId) void this.publishHeartbeat(true).catch(() => undefined);
  }

  protected desiredSubscribed = false;
  protected commandsSubscribed = false;
}

export { CAPABILITIES, type DiscoveryClaim } from './runtime/identity/protocol';
