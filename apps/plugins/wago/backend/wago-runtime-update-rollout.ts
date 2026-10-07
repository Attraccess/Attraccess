import { randomBytes } from 'node:crypto';
import { BuildRuntimeArtifact } from './wago-build-runtime';
import { RuntimeUpdateInspection, RuntimeUpdateRecord } from './wago-runtime-update-contracts';
import { CURRENT_RECHECK_MS } from './wago-runtime-update.current-recheck-ms';
import { RuntimeUpdateError } from './wago-runtime-update.errors';

import { RuntimeUpdateLease } from './wago-runtime-update-lease';
export abstract class RuntimeUpdateRollout extends RuntimeUpdateLease {
  protected async applyRollout(
    controllerId: number,
    desired: BuildRuntimeArtifact,
    record: RuntimeUpdateRecord,
    inspection: RuntimeUpdateInspection,
    operation: AbortController,
    assertOwned: () => void,
    persist: (record: RuntimeUpdateRecord) => Promise<void>,
    acknowledge: (record: RuntimeUpdateRecord) => Promise<boolean>,
    attempt: number,
  ): Promise<'deferred' | 'settled'> {
    record.token = randomBytes(16).toString('hex');
    const token = record.token;
    const previousImageId = inspection.imageId;
    try {
      record.phase = 'staging';
      await persist(record);
      await this.host.stage(controllerId, record.token, desired, operation.signal);
      await this.assertCurrent(desired.imageId);
      record.phase = 'activating';
      await persist(record);
      await this.host.activate(controllerId, record.token, desired, operation.signal);
      record.phase = 'verifying';
      await persist(record);
      const proof = await this.host.verify(
        controllerId,
        record.token,
        desired.imageId,
        record.startedAt,
        operation.signal,
      );
      if (
        !proof.permanent ||
        !proof.ready ||
        proof.imageId !== desired.imageId ||
        !Number.isSafeInteger(proof.observedAt) ||
        proof.observedAt <= record.startedAt ||
        proof.observedAt > this.now()
      ) {
        throw new RuntimeUpdateError('readiness');
      }
      await this.assertCurrent(desired.imageId);
      record.phase = 'accepting';
      await persist(record);
      await this.host.accept(controllerId, record.token, operation.signal);
      record.phase = 'current';
      record.currentImageId = desired.imageId;
      record.attempt = 0;
      record.retryAt = this.now() + CURRENT_RECHECK_MS;
      await persist(record);
      // This last cleanup cannot turn a durably accepted rollout into a failed
      // rollout. If interrupted, the next owner retries acknowledgement only.
      if (!(await acknowledge(record))) return 'deferred';
    } catch (error) {
      if (record.phase === 'current') throw error;
      // Never roll back after losing the lease/deadline. Leave the durable token
      // for a later owner and the independently running host watchdog.
      assertOwned();
      record.failure = error instanceof RuntimeUpdateError ? error.failure : 'interrupted';
      if (error instanceof RuntimeUpdateError && error.storageDiagnostics?.length)
        record.storageDiagnostics = error.storageDiagnostics;
      record.phase = 'recovering';
      await persist(record);
      try {
        await this.host.recover(controllerId, token, previousImageId, operation.signal);
        record.phase = 'failed';
      } catch {
        record.phase = 'recovery_required';
        record.failure = 'recovery';
      }
      record.retryAt = this.retryAt(attempt);
      await persist(record);
      if (record.phase === 'failed') {
        if (!(await acknowledge(record))) return 'deferred';
      }
    }
    return 'settled';
  }
}
