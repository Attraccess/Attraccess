import { ResourceMeter, ResourceMeteringSession } from '@attraccess/database-entities';
import { ReconciliationTestScope } from './resource-metering.persistence.spec';
export function registerReconciliationKeepsAnOlderChargePendingWhenAFreeStartFailsBeforeAcknowledging(
  scope: ReconciliationTestScope,
): void {
  it('keeps an older charge pending when a free start fails before acknowledging', async () => {
    const ended = await scope.endWithMissingFinal();
    const session = await scope.parentScope.sessionOf(ended.id);
    const before = await scope.parentScope.items(ended.id);
    await scope.parentScope.metering.setRate(1, 1, 0);
    const priorMeter = await scope.parentScope.source.getRepository(ResourceMeter).findOneByOrFail({ id: 1 });
    scope.parentScope.onStart = async () => {
      throw new Error('offline before acknowledgement');
    };

    const started = await scope.start(scope.parentScope.users[1]);
    expect((await scope.parentScope.usage.getActiveSession(1))?.id).toBe(started.id);
    expect(await scope.parentScope.source.getRepository(ResourceMeteringSession).countBy({ usageId: started.id })).toBe(
      0,
    );
    expect(await scope.parentScope.source.getRepository(ResourceMeter).findOneByOrFail({ id: 1 })).toEqual(priorMeter);
    expect(await scope.parentScope.sessionOf(ended.id)).toEqual(session);
    expect((await scope.parentScope.metering.getStatus(1)).unsettled).toEqual([
      expect.objectContaining({ sessionId: session.id, retryable: true, status: 'pending' }),
    ]);
    expect(await scope.parentScope.items(ended.id)).toEqual(before);
    expect((await scope.parentScope.correctionsOf(ended.id)).corrections).toEqual([]);
    expect(scope.parentScope.audit.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
    expect(scope.parentScope.liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
  });
}
