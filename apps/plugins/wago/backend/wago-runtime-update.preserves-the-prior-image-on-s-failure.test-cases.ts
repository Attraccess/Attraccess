import { RuntimeUpdateError } from './wago-runtime-update';
import type { DurableManagedRuntimeReconciliationTestScope } from "./wago-runtime-update.spec";

export function registerPreservesThePriorImageOnSFailure(scope: DurableManagedRuntimeReconciliationTestScope): void {
it.each(['transfer', 'load', 'storage', 'host_gate'] as const)(
    'preserves the prior image on %s failure',
    async (failure) => {
      scope.host.activate.mockRejectedValueOnce(new RuntimeUpdateError(failure));
      await scope.coordinator.reconcile(1);
      expect(scope.rows.get(1)).toMatchObject({ phase: 'failed', failure });
      expect(scope.host.recover).toHaveBeenCalledWith(1, expect.any(String), scope.release('a').imageId, expect.any(AbortSignal));
    },
  );
}
