import { WagoRuntimeUpdateCoordinator } from './wago-runtime-update';
import { ManagedRuntimeUpdateHost } from './wago-runtime-update';
import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function registerDurableManagedRuntimeReconciliationDefersSettledCurrentSshWorkDurablyAlreadyCurrentSButChecksANewBuildImmediately(
  scope: DurableManagedRuntimeReconciliationTestScope,
): void {
  it.each([false, true])(
    'defers settled current SSH work durably (already-current=%s) but checks a new build immediately',
    async (alreadyCurrent) => {
      if (alreadyCurrent)
        scope.host.inspect.mockResolvedValue({
          imageId: scope.desired.imageId,
          managed: true,
          claimed: true,
          compatible: true,
          online: true,
        });
      scope.host.prepare = jest.fn<
        ReturnType<NonNullable<ManagedRuntimeUpdateHost['prepare']>>,
        Parameters<NonNullable<ManagedRuntimeUpdateHost['prepare']>>
      >(async () => undefined);
      await scope.coordinator.reconcile(1);
      expect(scope.rows.get(1)).toMatchObject({ phase: 'current', retryAt: scope.now + 5 * 60_000 });
      scope.host.inspect.mockClear();
      scope.host.prepare.mockClear();
      scope.host.verify.mockClear();
      scope.now += 30_000;
      scope.coordinator.stop();
      scope.coordinator = new WagoRuntimeUpdateCoordinator(
        scope.store,
        async () => scope.desired,
        scope.host,
        scope.audit,
        () => scope.now,
      );
      expect(await scope.coordinator.reconcile(1)).toBe('deferred');
      expect(scope.host.inspect).not.toHaveBeenCalled();
      expect(scope.host.prepare).not.toHaveBeenCalled();
      expect(scope.host.verify).not.toHaveBeenCalled();
      scope.desired = scope.release('c');
      expect(await scope.coordinator.reconcile(1)).toBe('settled');
      expect(scope.host.inspect).toHaveBeenCalledTimes(1);
      expect(scope.rows.get(1)).toMatchObject({ phase: 'current', desiredImageId: scope.desired.imageId });
    },
  );
}
