import { RuntimeUpdateError } from './wago-runtime-update';
import type { DurableManagedRuntimeReconciliationTestScope } from "./wago-runtime-update.spec";

export function registerGivesANewRolloutItsOwnDeadlineAfterSlowCrashRecoveryAndAcknowledgement(scope: DurableManagedRuntimeReconciliationTestScope): void {
it('gives a new rollout its own deadline after slow crash recovery and acknowledgement', async () => {
    scope.host.stage.mockRejectedValueOnce(new RuntimeUpdateError('transfer'));
    scope.host.recover.mockRejectedValueOnce(new RuntimeUpdateError('recovery'));
    await scope.coordinator.reconcile(1);
    scope.host.stage.mockClear();
    scope.host.recover.mockImplementation(async () => { scope.now += 20 * 60_000; });
    scope.host.acknowledge.mockImplementation(async () => { scope.now += 4 * 60_000; });
    scope.host.stage.mockImplementation(async () => { scope.now += 2 * 60_000; });
    expect(await scope.coordinator.reconcile(1, true)).toBe('settled');
    expect(scope.rows.get(1)).toMatchObject({ phase: 'failed', failure: 'interrupted', token: null });
    expect(scope.host.stage).not.toHaveBeenCalled();
    expect(scope.owners.size).toBe(0);
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)).toMatchObject({ phase: 'current', token: null });
  });
}
