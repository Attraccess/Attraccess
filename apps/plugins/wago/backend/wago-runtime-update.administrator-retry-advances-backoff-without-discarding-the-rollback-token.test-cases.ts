import { RuntimeUpdateError } from './wago-runtime-update';
import type { DurableManagedRuntimeReconciliationTestScope } from "./wago-runtime-update.spec";

export function registerAdministratorRetryAdvancesBackoffWithoutDiscardingTheRollbackToken(scope: DurableManagedRuntimeReconciliationTestScope): void {
it('administrator retry advances backoff without discarding the rollback token', async () => {
    scope.host.activate.mockRejectedValueOnce(new RuntimeUpdateError('load'));
    scope.host.recover.mockRejectedValueOnce(new RuntimeUpdateError('recovery'));
    await scope.coordinator.reconcile(1);
    const pending = { ...scope.rows.get(1)! };
    expect(pending.phase).toBe('recovery_required');
    expect(await scope.coordinator.reconcile(1)).toBe('deferred');
    scope.host.recover.mockImplementationOnce(async (id, token, previous) => {
      expect(token).toBe(pending.token);
      expect(previous).toBe(pending.previousImageId);
      expect(scope.rows.get(id)?.phase).toBe('recovering');
    });
    expect(await scope.coordinator.reconcile(1, true)).toBe('settled');
    expect(scope.rows.get(1)).toMatchObject({ phase: 'failed', failure: 'interrupted', token: null });
    await scope.coordinator.reconcile(1);
    expect(scope.rows.get(1)).toMatchObject({ phase: 'current', token: null });
    expect(scope.host.recover).toHaveBeenCalledTimes(2);
  });
}
