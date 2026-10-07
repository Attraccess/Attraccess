import { randomUUID } from 'node:crypto';
// The standalone runtime bundles the plugin-owned measurement contract.
// The API and standalone runtime enforce the same configured output behavior.
import { validateDesired } from './configuration';
import { RuntimeTelemetry } from './runtime-telemetry';

export { hash, PROTOCOL_VERSION, validateDesired, validateSnapshot } from './configuration';
export { MAX_PENDING_CHANNEL_WRITES } from './output-controller';
export type { DeviceAdapter, RuntimeState, Snapshot, Transport, ValidationError } from './runtime-types';
export { JsonStateStore } from './state-store';

export class WagoRuntime extends RuntimeTelemetry {
  async start(activateConnectionHandling?: () => Promise<void>): Promise<void> {
    this.state = await this.options.store.load();
    this.sequence = this.state.sequence ?? 0;
    this.reservedSequence = this.sequence;
    this.initialSequence = 0;
    if (this.state.accepted) {
      // Keep operating configurations written by older runtime versions alive. New
      // desired configurations reject invalid measurement metadata, but a persisted
      // legacy transform is handled by the measurement fault path instead of making
      // the controller unavailable after a restart.
      const errors = validateDesired({ protocolVersion: 1, ...this.state.accepted }).filter(
        ({ code }) => code !== 'invalid_measurement',
      );
      if (errors.length) throw new Error('persisted configuration is invalid');
      this.options.device.configure?.(this.state.accepted.snapshot);
    }
    this.outputs.recoverPulses();
    this.loaded = true;
    if (this.runtimeUpdateRequired || this.runtimeFailsafePending) await this.applyRuntimeUpdateFailsafe();
    else await this.outputs.applyDisconnectPolicies(this.connected);
    await this.options.transport.subscribe(this.desiredTopic(), (payload) => this.receiveDesired(payload));
    await this.options.transport.subscribe(this.commandTopic(), (payload) => this.receiveCommand(payload));
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
}

export { CAPABILITIES, DiscoveryClaim } from './runtime-protocol';
