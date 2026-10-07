import type { ManagedRuntimeUpdateHost } from './wago-runtime-update';
import type { DurableManagedRuntimeReconciliationTestScope } from "./wago-runtime-update.spec";
export function registerPersistsAndAuditsInstallerPreparationBeforePublicationAndAuditFailurePreventsIt(scope: DurableManagedRuntimeReconciliationTestScope): void {
it('persists and audits installer preparation before publication, and audit failure prevents it', async () => {
    scope.host.prepare = jest.fn<
      ReturnType<NonNullable<ManagedRuntimeUpdateHost['prepare']>>,
      Parameters<NonNullable<ManagedRuntimeUpdateHost['prepare']>>
    >(async () => {
      expect(scope.rows.get(1)?.phase).toBe('preparing');
      expect(scope.audit).toHaveBeenCalledWith(expect.objectContaining({ phase: 'preparing' }));
    });
    scope.audit.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(scope.coordinator.reconcile(1)).rejects.toThrow('audit unavailable');
    expect(scope.host.prepare).not.toHaveBeenCalled();
    expect(scope.host.stage).not.toHaveBeenCalled();
    expect(await scope.coordinator.reconcile(1)).toBe('settled');
    expect(scope.host.prepare).toHaveBeenCalledTimes(1);
    expect(scope.rows.get(1)?.phase).toBe('current');
  });
}
