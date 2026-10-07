import { WagoRuntimeUpdateCoordinator } from './wago-runtime-update';
import { ManagedRuntimeUpdateHost } from './wago-runtime-update';
import { DurableManagedRuntimeReconciliationTestScope } from './wago-runtime-update.spec';
export function resetTestFixture(scope: DurableManagedRuntimeReconciliationTestScope) {
  scope.now = 1_000_000;
  scope.desired = scope.release('b');
  scope.rows = new Map();
  scope.owners = new Map();
  scope.store = {
    acquire: async (id, owner) => {
      if (scope.owners.has(id)) return false;
      scope.owners.set(id, owner);
      return true;
    },
    load: async (id) => {
      const row = scope.rows.get(id);
      return row ? { ...row } : null;
    },
    save: async (row, owner) => {
      if (scope.owners.get(row.controllerId) !== owner) throw new Error('lease_lost');
      scope.rows.set(row.controllerId, { ...row });
    },
    release: async (id, owner) => {
      if (scope.owners.get(id) === owner) scope.owners.delete(id);
    },
  };
  scope.host = {
    inspect: jest.fn<ReturnType<ManagedRuntimeUpdateHost['inspect']>, Parameters<ManagedRuntimeUpdateHost['inspect']>>(
      async () => ({
        imageId: scope.release('a').imageId,
        managed: true,
        claimed: true,
        compatible: true,
        online: true,
      }),
    ),
    stage: jest.fn<ReturnType<ManagedRuntimeUpdateHost['stage']>, Parameters<ManagedRuntimeUpdateHost['stage']>>(
      async () => undefined,
    ),
    activate: jest.fn<
      ReturnType<ManagedRuntimeUpdateHost['activate']>,
      Parameters<ManagedRuntimeUpdateHost['activate']>
    >(async () => undefined),
    verify: jest.fn<ReturnType<ManagedRuntimeUpdateHost['verify']>, Parameters<ManagedRuntimeUpdateHost['verify']>>(
      async () => ({ imageId: scope.desired.imageId, permanent: true, ready: true, observedAt: ++scope.now }),
    ),
    accept: jest.fn<ReturnType<ManagedRuntimeUpdateHost['accept']>, Parameters<ManagedRuntimeUpdateHost['accept']>>(
      async () => undefined,
    ),
    acknowledge: jest.fn<
      ReturnType<ManagedRuntimeUpdateHost['acknowledge']>,
      Parameters<ManagedRuntimeUpdateHost['acknowledge']>
    >(async () => undefined),
    recover: jest.fn<ReturnType<ManagedRuntimeUpdateHost['recover']>, Parameters<ManagedRuntimeUpdateHost['recover']>>(
      async () => undefined,
    ),
  };
  scope.audit = jest.fn(async () => undefined);
  scope.coordinator = new WagoRuntimeUpdateCoordinator(
    scope.store,
    async () => scope.desired,
    scope.host,
    scope.audit,
    () => scope.now,
  );
}
