import type { DurableManagedRuntimeReconciliationTestScope } from "./wago-runtime-update.spec";
export function registerRejectsIncompleteRetainedOrWrongImageReadinessJ(scope: DurableManagedRuntimeReconciliationTestScope): void {
it.each([{ permanent: false }, { ready: false }, { imageId: scope.release('a').imageId }, { observedAt: 1_000_000 }])(
    'rejects incomplete, retained, or wrong-image readiness %j',
    async (overrides) => {
      scope.host.verify.mockImplementation(async () => ({
        imageId: scope.desired.imageId,
        permanent: true,
        ready: true,
        observedAt: ++scope.now,
        ...overrides,
      }));
      await scope.coordinator.reconcile(1);
      expect(scope.rows.get(1)).toMatchObject({ phase: 'failed', failure: 'readiness' });
      expect(scope.host.accept).not.toHaveBeenCalled();
    },
  );
}
