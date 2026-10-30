import { hash, validateConfigurationLimits, validateDesired } from './validation';
import { OutputRoutingBusyError } from '../../outputs/controller';
import { RuntimeDiscovery } from '../identity/discovery';
import { type Snapshot } from '../types';

type DesiredMessage = {
  protocolVersion: number;
  revision: number;
  contentHash: string;
  snapshot: Snapshot;
  runtimeImageId?: string;
  runtimePolicyToken?: string;
};

/** The decoded desired message, or undefined when it is not valid JSON (JSON itself never decodes to undefined). */
function parseDesired(payload: Buffer): DesiredMessage | undefined {
  try {
    return JSON.parse(payload.toString('utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Only the runtime policy fields of a desired message, so the parsed configuration is not kept alive
 * while the failsafe waits for the configuration lock.
 */
function runtimePolicy(payload: Buffer) {
  const desired = parseDesired(payload);
  if (desired === undefined) return 'invalid' as const;
  if (!desired || !Object.prototype.hasOwnProperty.call(desired, 'runtimeImageId')) return undefined;
  return {
    runtimeImageId: desired.runtimeImageId as unknown,
    runtimePolicyToken: desired.runtimePolicyToken as unknown,
    hasSnapshot: Object.prototype.hasOwnProperty.call(desired, 'snapshot'),
  };
}

export abstract class RuntimeConfiguration extends RuntimeDiscovery {
  async receiveDesired(payload: Buffer): Promise<void> {
    // Runtime policy is applied before the configuration lock, because its failsafe takes that lock
    // itself. Only a message that can carry the policy field is decoded here: the key either appears
    // literally or is spelled with a \u escape. Everything else is decoded under the lock, so updates
    // waiting their turn never hold a parsed configuration.
    if ((payload.includes('runtimeImageId') || payload.includes('\\u')) && (await this.applyRuntimePolicy(payload)))
      return;
    if (this.runtimeUpdateRequired || this.runtimeFailsafePending) return;
    await this.runConfigurationUpdate(async () => {
      const desired = parseDesired(payload);
      if (desired === undefined) return this.reportInvalidJson();
      if (this.runtimeUpdateRequired || this.runtimeFailsafePending) return;
      const redelivered =
        this.state.accepted?.revision === desired?.revision &&
        this.state.accepted?.contentHash === desired?.contentHash;
      // A stale revision is refused as stale, whatever else is wrong with it. A revision that is not a
      // positive integer is left to validation, which reports it as invalid.
      const revision = desired?.revision;
      if (Number.isSafeInteger(revision) && revision > 0 && (this.state.accepted?.revision ?? 0) > revision)
        return this.reportRejected(desired.revision, desired.contentHash, [
          { path: 'revision', code: 'stale_revision', message: 'configuration revision is stale' },
        ]);
      // Limits guard new revisions and rollbacks; what is already running is never refused for them.
      const limitErrors = redelivered ? [] : validateConfigurationLimits(desired);
      if (limitErrors.length) return this.reportRejected(desired.revision, desired.contentHash, limitErrors);
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

  /** Applies the runtime-update policy a desired message carries; true when nothing else is left to do. */
  private async applyRuntimePolicy(payload: Buffer): Promise<boolean> {
    const policy = runtimePolicy(payload);
    if (policy === 'invalid') {
      await this.reportInvalidJson();
      return true;
    }
    if (!policy) return false;
    if (typeof policy.runtimeImageId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(policy.runtimeImageId)) return true;
    if (this.options.runtimeImageId && policy.runtimePolicyToken !== this.runtimePolicyToken) return true;
    this.runtimeUpdateRequired = policy.runtimeImageId !== this.options.runtimeImageId;
    if (this.runtimeUpdateRequired || this.runtimeFailsafePending) await this.applyRuntimeUpdateFailsafe();
    this.requestStatePublication();
    // Policy-only messages use the existing authenticated configuration ACL.
    return !policy.hasSnapshot;
  }

  private reportInvalidJson(): Promise<void> {
    return this.reportRejected(0, '', [
      { path: '$', code: 'invalid_json', message: 'desired configuration is not valid JSON' },
    ]);
  }

  protected async applyRuntimeUpdateFailsafe(): Promise<void> {
    this.runtimeFailsafePending = true;
    this.resyncMeasurements();
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
