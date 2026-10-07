import type { DurableManagedRuntimeReconciliationTestScope } from "./wago-runtime-update.spec";
export function registerAdministratorRetryHonorsRetainedAcceptedCleanupBeforeStagingANewRelease(scope: DurableManagedRuntimeReconciliationTestScope): void {
it('administrator retry honors retained accepted cleanup before staging a new release', async () => {
    scope.host.acknowledge.mockRejectedValueOnce(new Error('interrupted'));
    await scope.coordinator.reconcile(1);
    const pending = { ...scope.rows.get(1)! };
    scope.desired = scope.release('c');
    scope.host.acknowledge.mockImplementationOnce(async (id, token) => {
      expect(token).toBe(pending.token);
      expect(scope.rows.get(id)?.phase).toBe('current');
      expect(scope.host.stage).toHaveBeenCalledTimes(1);
    });
    expect(await scope.coordinator.reconcile(1, true)).toBe('settled');
    expect(scope.rows.get(1)).toMatchObject({ phase: 'current', desiredImageId: scope.desired.imageId, token: null });
  });
}
