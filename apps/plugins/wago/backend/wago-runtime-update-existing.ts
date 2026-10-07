import type { BuildRuntimeArtifact } from './wago-build-runtime';
import { RuntimeUpdateRecord } from './wago-runtime-update-contracts';
import { RuntimeUpdateRollout } from './wago-runtime-update-rollout';
import { CURRENT_RECHECK_MS } from './wago-runtime-update.current-recheck-ms';
import { RuntimeUpdateError } from './wago-runtime-update.errors';
export abstract class RuntimeUpdateExisting extends RuntimeUpdateRollout {
  protected async verifyExisting(
    controllerId: number,
    desired: BuildRuntimeArtifact,
    record: RuntimeUpdateRecord,
    operation: AbortController,
    assertOwned: () => void,
    persist: (record: RuntimeUpdateRecord) => Promise<void>,
    attempt: number,
  ): Promise<'settled'> {
    // Read-only proof permits the existing boot, but requires a recent
    // permanent heartbeat and matching readiness. No restart or staging.
    const since = record.startedAt;
    try {
      const proof = await this.host.verify(controllerId, null, desired.imageId, since, operation.signal);
      if (
        !proof.permanent ||
        !proof.ready ||
        proof.imageId !== desired.imageId ||
        !Number.isSafeInteger(proof.observedAt) ||
        proof.observedAt <= since ||
        proof.observedAt > this.now()
      )
        throw new RuntimeUpdateError('readiness');
      await this.assertCurrent(desired.imageId);
    } catch (error) {
      assertOwned();
      record.phase = 'blocked';
      record.failure = error instanceof RuntimeUpdateError ? error.failure : 'readiness';
      record.retryAt = this.retryAt(attempt);
      await persist(record);
      return 'settled';
    }
    record.phase = 'current';
    record.attempt = 0;
    record.retryAt = this.now() + CURRENT_RECHECK_MS;
    await persist(record);
    return 'settled';
  }
}
