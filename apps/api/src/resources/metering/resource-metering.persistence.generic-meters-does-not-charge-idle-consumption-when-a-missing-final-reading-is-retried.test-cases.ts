import { ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersDoesNotChargeIdleConsumptionWhenAMissingFinalReadingIsRetried(
  scope: GenericMetersTestScope,
): void {
  it('does not charge idle consumption when a missing final reading is retried', async () => {
    await scope.seedMeter();
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    scope.onCollect = async () => {
      throw new Error('offline');
    };
    await scope.usage.endSession(1, scope.users[0], {} as never);
    const session = await scope.sessionOf(started.id);
    expect(session.status).toBe(ResourceMeteringSessionStatus.Pending);
    await scope.metering.report(1, 1, { kind: 'reading', value: '3' });
    expect((await scope.sessionOf(started.id)).status).toBe(ResourceMeteringSessionStatus.Failed);
    await expect(scope.metering.retrySettlement(1, session.id, scope.users[0].id)).rejects.toThrow();
    expect((await scope.items(started.id)).transaction.amount).toBe(0);
  });
}
