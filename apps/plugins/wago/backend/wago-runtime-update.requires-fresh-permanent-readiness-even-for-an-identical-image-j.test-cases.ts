import type { DurableManagedRuntimeReconciliationTestScope } from "./wago-runtime-update.spec";
export function registerRequiresFreshPermanentReadinessEvenForAnIdenticalImageJ(scope: DurableManagedRuntimeReconciliationTestScope): void {
it.each([{ permanent: false }, { ready: false }, { observedAt: 0 }, { imageId: scope.release('b').imageId }])(
    'requires fresh permanent readiness even for an identical image %j',
    async (overrides) => {
      scope.desired = scope.release('a');
      scope.host.verify.mockResolvedValue({
        imageId: scope.desired.imageId,
        permanent: true,
        ready: true,
        observedAt: scope.now,
        ...overrides,
      });
      await scope.coordinator.reconcile(1);
      expect(scope.rows.get(1)).toMatchObject({ phase: 'blocked', failure: 'readiness' });
      expect(scope.host.stage).not.toHaveBeenCalled();
      expect(scope.host.activate).not.toHaveBeenCalled();
      expect(scope.host.recover).not.toHaveBeenCalled();
    },
  );
}
