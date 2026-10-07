import { ResourceMeter, ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { ReconciliationTestScope } from './resource-metering.persistence.spec';
export function registerReconciliationRejectsARetryFirstObservingIdleConsumptionS(
  scope: ReconciliationTestScope,
): void {
  it.each([undefined, 'after-end'])('rejects a retry first observing idle consumption (%s)', async (timestamp) => {
    const ended = await scope.endWithMissingFinal();
    const session = await scope.parentScope.sessionOf(ended.id);
    scope.parentScope.onCollect = scope.parentScope.reading('5', {
      observedAt: timestamp ? new Date((ended.endTime as Date).getTime() + 1).toISOString() : undefined,
    });
    await expect(scope.parentScope.metering.retrySettlement(1, session.id, 1)).rejects.toThrow('session end boundary');
    expect((await scope.parentScope.correctionsOf(ended.id)).corrections).toEqual([]);
    expect((await scope.parentScope.source.getRepository(ResourceMeter).findOneByOrFail({ id: 1 })).counterValue).toBe(
      '0',
    );
    expect((await scope.parentScope.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
  });
}
