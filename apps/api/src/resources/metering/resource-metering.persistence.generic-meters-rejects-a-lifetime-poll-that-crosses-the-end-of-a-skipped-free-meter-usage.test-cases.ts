import { ResourceMeter, ResourceMeteringOperation, ResourceUsage } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersRejectsALifetimePollThatCrossesTheEndOfASkippedFreeMeterUsage(
  scope: GenericMetersTestScope,
): void {
  it('rejects a lifetime poll that crosses the end of a skipped free-meter usage', async () => {
    await scope.seedMeter({}, { interimIntervalMinutes: 1 });
    await scope.metering.setRate(1, 1, 0);
    await scope.source.getRepository(ResourceMeter).update(1, { counterValue: '100000000000' });
    scope.onStart = async () => {
      throw new Error('offline');
    };
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    await scope.source.getRepository(ResourceUsage).update(started.id, { startTime: new Date(Date.now() - 1_000) });
    scope.onCollect = async ({ complete }) => {
      await scope.usage.endSession(1, scope.users[0], {} as never);
      await complete({ kind: 'reading', mode: 'increment', value: '5' });
    };
    await scope.metering.collectInterimReadings();
    expect(scope.log).toContain('meter:interim');
    const operation = await scope.source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'interim' });
    expect(operation).toMatchObject({ status: 'failed', error: expect.stringContaining('session boundary') });
    expect((await scope.metering.listMeters(1))[0]).toMatchObject({ counterValue: '100', lifetimeValue: '0' });
    expect((await scope.items(started.id)).transaction.amount).toBe(0);
  });
}
