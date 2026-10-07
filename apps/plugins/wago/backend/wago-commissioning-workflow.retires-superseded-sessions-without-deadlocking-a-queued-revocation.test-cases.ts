import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerRetiresSupersededSessionsWithoutDeadlockingAQueuedRevocation(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('retires superseded sessions without deadlocking a queued revocation', async () => {
    const { id: _id, ...values } = scope.session;
    void _id;
    const second = await scope.db.getRepository(WagoCommissioningSession).save(values);
    let entered!: () => void;
    let proceed!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const next = new Promise<void>((resolve) => {
      proceed = resolve;
    });
    const first = scope.service['withControllerLock'](scope.session.id, async () => {
      entered();
      await next;
      await scope.service['retireSupersededSessions'](scope.session.hardwareId, scope.session.id);
    });
    await ready;
    const revoke = scope.service.revoke(second.id);
    await new Promise((resolve) => setImmediate(resolve));
    proceed();
    await Promise.all([first, revoke]);
    expect((await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: second.id })).state).toBe('revoked');
  });
}
