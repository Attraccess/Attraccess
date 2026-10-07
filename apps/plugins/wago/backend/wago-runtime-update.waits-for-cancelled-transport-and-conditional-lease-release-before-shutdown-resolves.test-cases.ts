import { RuntimeUpdateError } from './wago-runtime-update';
import type { DurableManagedRuntimeReconciliationTestScope } from "./wago-runtime-update.spec";

export function registerWaitsForCancelledTransportAndConditionalLeaseReleaseBeforeShutdownResolves(scope: DurableManagedRuntimeReconciliationTestScope): void {
it('waits for cancelled transport and conditional lease release before shutdown resolves', async () => {
    let entered!: () => void;
    const staging = new Promise<void>((resolve) => { entered = resolve; });
    scope.host.stage.mockImplementation(async (_id, _token, _desired, signal) => {
      entered();
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new RuntimeUpdateError('interrupted')), { once: true });
      });
    });
    let release!: () => void, releasing!: () => void;
    const leaseRelease = new Promise<void>((resolve) => { release = resolve; });
    const releaseStarted = new Promise<void>((resolve) => { releasing = resolve; });
    const originalRelease = scope.store.release;
    scope.store.release = async (id, owner) => { releasing(); await leaseRelease; await originalRelease(id, owner); };
    const update = expect(scope.coordinator.reconcile(1)).rejects.toThrow('interrupted');
    await staging;
    let stopped = false;
    const shutdown = Promise.resolve(scope.coordinator.stop()).then(() => { stopped = true; });
    await releaseStarted;
    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(scope.owners.size).toBe(1);
    release();
    await Promise.all([shutdown, update]);
    expect(scope.owners.size).toBe(0);
    expect(scope.rows.get(1)?.phase).toBe('staging');
    expect(scope.host.recover).not.toHaveBeenCalled();
  });
}
