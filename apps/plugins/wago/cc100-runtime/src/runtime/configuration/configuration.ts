import { hash, validateDesired } from './validation';
import { OutputRoutingBusyError } from '../../outputs/controller';
import { RuntimeDiscovery } from '../identity/discovery';
import { type Snapshot } from '../types';

export abstract class RuntimeConfiguration extends RuntimeDiscovery {
  async receiveDesired(payload: Buffer): Promise<void> {
    let desired: {
      protocolVersion: number;
      revision: number;
      contentHash: string;
      snapshot: Snapshot;
      runtimeImageId?: string;
      runtimePolicyToken?: string;
    };
    try {
      desired = JSON.parse(payload.toString('utf8'));
    } catch {
      return this.reportRejected(0, '', [
        { path: '$', code: 'invalid_json', message: 'desired configuration is not valid JSON' },
      ]);
    }
    if (desired && Object.prototype.hasOwnProperty.call(desired, 'runtimeImageId')) {
      if (typeof desired.runtimeImageId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(desired.runtimeImageId)) return;
      if (this.options.runtimeImageId && desired.runtimePolicyToken !== this.runtimePolicyToken) return;
      this.runtimeUpdateRequired = desired.runtimeImageId !== this.options.runtimeImageId;
      if (this.runtimeUpdateRequired || this.runtimeFailsafePending) await this.applyRuntimeUpdateFailsafe();
      this.requestStatePublication();
      // Policy-only messages use the existing authenticated configuration ACL.
      if (!Object.prototype.hasOwnProperty.call(desired, 'snapshot')) return;
    }
    if (this.runtimeUpdateRequired || this.runtimeFailsafePending) return;
    await this.runConfigurationUpdate(async () => {
      if (this.runtimeUpdateRequired || this.runtimeFailsafePending) return;
      const errors = validateDesired(desired);
      if (!errors.length && desired.contentHash !== hash(desired.snapshot))
        errors.push({ path: 'contentHash', code: 'hash_mismatch', message: 'content hash does not match snapshot' });
      if (!errors.length) errors.push(...(this.options.device.validate?.(desired.snapshot) ?? []));
      if (errors.length) return this.reportRejected(desired.revision, desired.contentHash, errors);
      if (
        this.state.accepted?.revision === desired.revision &&
        this.state.accepted.contentHash === desired.contentHash
      ) {
        await this.publishReport(desired.revision, desired.contentHash, []);
        return;
      }
      if ((this.state.accepted?.revision ?? 0) > desired.revision)
        return this.reportRejected(desired.revision, desired.contentHash, [
          { path: 'revision', code: 'stale_revision', message: 'configuration revision is stale' },
        ]);
      const installRouting =
        this.options.device.prepareConfiguration?.(desired.snapshot) ??
        (() => this.options.device.configure?.(desired.snapshot));
      // Keep the command barrier through this commit so old-revision commands cannot cross the boundary.
      try {
        await this.outputs.replaceConfiguration(async () => {
          this.outputs.assertConfigurationSafe(desired.snapshot);
          const accepted = {
            revision: desired.revision,
            contentHash: desired.contentHash,
            snapshot: desired.snapshot,
          };
          this.configurationPending = true;
          const resume = this.options.device.suspend?.();
          try {
            await this.queueStateUpdate(async () => {
              const manualOutputChannelIds = (this.state.manualOutputChannelIds ?? []).filter((id) =>
                accepted.snapshot.logicalChannels.some(
                  (channel) => channel.id === id && channel.capabilities.includes('output'),
                ),
              );
              await this.options.store.save({ ...this.state, accepted, manualOutputChannelIds });
              installRouting();
              this.state.accepted = accepted;
              this.state.manualOutputChannelIds = manualOutputChannelIds;
            });
          } finally {
            resume?.();
            this.configurationPending = false;
          }
        });
      } catch (error) {
        if (error instanceof OutputRoutingBusyError)
          return this.reportRejected(desired.revision, desired.contentHash, [
            { path: 'snapshot', code: 'outputs_busy', message: 'switch outputs off before changing their routing' },
          ]);
        return this.reportRejected(desired.revision, desired.contentHash, [
          { path: 'snapshot', code: 'configuration_commit_failed', message: 'failed to commit configuration' },
        ]);
      }
      await this.publishReport(desired.revision, desired.contentHash, []);
      await this.publishState();
    });
  }

  protected async applyRuntimeUpdateFailsafe(): Promise<void> {
    this.runtimeFailsafePending = true;
    try {
      await this.runConfigurationUpdate(() => this.outputs.applyRuntimeUpdateFailsafe());
      this.runtimeFailsafePending = false;
    } catch {
      // The pending shutdown blocks readiness and is retried by heartbeats.
      // Preserve any matching image approval received while hardware was unavailable.
    }
  }

  protected async runConfigurationUpdate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.configurationUpdates;
    let release!: () => void;
    this.configurationUpdates = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
