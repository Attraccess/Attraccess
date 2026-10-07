import { ResourceMeter, ResourceMeteringSession } from '@attraccess/database-entities';
import { OperationsTestScope } from './resource-metering.persistence.spec';
export function registerOperationsDoesNotPollAMeterThatKeepsFailingMoreOftenThanItsInterval(
  scope: OperationsTestScope,
): void {
  it('does not poll a meter that keeps failing more often than its interval', async () => {
    const session = await scope.activeSession();
    await scope.source
      .getRepository(ResourceMeteringSession)
      .update(session.id, { createdAt: new Date(Date.now() - 3_600_000) });
    await scope.source.getRepository(ResourceMeter).update(1, { latestObservedAt: new Date(Date.now() - 3_600_000) });
    const collect = jest.fn().mockRejectedValue(new Error('meter unreachable'));
    scope.onCollect = collect;
    await scope.metering.collectInterimReadings();
    await scope.metering.collectInterimReadings();
    expect(collect).toHaveBeenCalledTimes(1);
  });
}
