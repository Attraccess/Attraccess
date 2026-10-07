import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationPersistsAndAuditsIntentBeforeEachRemoteEffectAndMarksCurrentOnlyAfterFreshReadiness(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it('persists and audits intent before each remote effect and marks current only after fresh readiness', async () => {
    scope.host.stage.mockImplementation(async () => {
      expect(scope.rows.get(1)?.phase).toBe('staging');
      expect(scope.audit).toHaveBeenCalled();
    });
    scope.host.activate.mockImplementation(async () => {
      expect(scope.rows.get(1)?.phase).toBe('activating');
    });
    scope.host.accept.mockImplementation(async () => {
      expect(scope.rows.get(1)?.phase).toBe('accepting');
    });
    scope.host.acknowledge.mockImplementation(async () => {
      expect(scope.rows.get(1)?.phase).toBe('current');
      expect(scope.rows.get(1)?.token).toMatch(/^[a-f0-9]{32}$/);
    });
    expect(await scope.coordinator.reconcile(1)).toBe('settled');
    expect(scope.rows.get(1)).toMatchObject({
      phase: 'current',
      token: null,
      desiredImageId: scope.release('b').imageId,
      failure: null,
    });
    expect(scope.host.recover).not.toHaveBeenCalled();
  });
}
