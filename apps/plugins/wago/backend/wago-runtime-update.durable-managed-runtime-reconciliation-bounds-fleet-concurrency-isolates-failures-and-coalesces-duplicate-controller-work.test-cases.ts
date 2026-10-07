import { RuntimeUpdateError } from './wago-runtime-update';
import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationBoundsFleetConcurrencyIsolatesFailuresAndCoalescesDuplicateControllerWork(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it('bounds fleet concurrency, isolates failures, and coalesces duplicate controller work', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    scope.host.stage.mockImplementation(async (id) => {
      if (id === 1) await gate;
      else throw new RuntimeUpdateError('transfer');
    });
    const first = scope.coordinator.reconcile(1);
    const second = scope.coordinator.reconcile(2);
    expect(await scope.coordinator.reconcile(1)).toBe('busy');
    expect(await scope.coordinator.reconcile(3)).toBe('busy');
    await second;
    expect(scope.rows.get(2)?.phase).toBe('failed');
    finish();
    await first;
    expect(scope.rows.get(1)?.phase).toBe('current');
    expect(scope.host.recover.mock.calls.every(([id]) => id === 2)).toBe(true);
  });
}
