import { ResourceMeter, ResourceMeteringOperation } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersPeriodicallyCollectsIdleConsumptionWithoutAddingItToTheCompletedBill(
  scope: GenericMetersTestScope,
): void {
  it('periodically collects idle consumption without adding it to the completed bill', async () => {
    await scope.seedMeter();
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    await scope.usage.endSession(1, scope.users[0], {} as never);
    await scope.source.getRepository(ResourceMeter).update(1, { latestObservedAt: new Date(Date.now() - 3_600_000) });
    scope.onCollect = scope.reading('2.5');
    await scope.metering.collectInterimReadings();
    expect((await scope.metering.listMeters(1))[0]).toEqual(
      expect.objectContaining({ lifetimeValue: '2.5', session: null }),
    );
    expect((await scope.items(started.id)).transaction.amount).toBe(-45);
    expect(
      (await scope.source.getRepository(ResourceMeteringOperation).find()).some(
        (operation) => operation.sessionId === null,
      ),
    ).toBe(true);
  });
}
