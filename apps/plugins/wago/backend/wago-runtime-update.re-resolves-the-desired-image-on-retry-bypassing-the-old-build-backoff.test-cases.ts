import { RuntimeUpdateError } from './wago-runtime-update';
import type { DurableManagedRuntimeReconciliationTestScope } from "./wago-runtime-update.spec";

export function registerReResolvesTheDesiredImageOnRetryBypassingTheOldBuildBackoff(scope: DurableManagedRuntimeReconciliationTestScope): void {
it('re-resolves the desired image on retry, bypassing the old build backoff', async () => {
    scope.host.stage.mockRejectedValueOnce(new RuntimeUpdateError('transfer'));
    await scope.coordinator.reconcile(1);
    scope.desired = scope.release('c');
    await scope.coordinator.reconcile(1);
    expect(scope.host.stage.mock.calls[1][2].imageId).toBe(scope.release('c').imageId);
    expect(scope.rows.get(1)?.phase).toBe('current');
  });
}
