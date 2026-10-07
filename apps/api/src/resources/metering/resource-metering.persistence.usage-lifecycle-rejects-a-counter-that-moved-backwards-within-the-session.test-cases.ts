import { ResourceMeteringSession, ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleRejectsACounterThatMovedBackwardsWithinTheSession(
  scope: UsageLifecycleTestScope,
): void {
  it('rejects a counter that moved backwards within the session', async () => {
    await scope.seedMeter({}, { finalAttempts: 1 });
    await scope.start();
    const session = await scope.source.getRepository(ResourceMeteringSession).findOneByOrFail({ resourceId: 1 });
    scope.onCollect = scope.reading('2.0');
    await scope.metering['runOperation'](session, 'interim', {
      trigger: scope.T.INPUT_METERING_COLLECT,
      timeoutSeconds: 5,
    });
    scope.onCollect = scope.reading('1.0');
    const ended = await scope.end();
    expect((await scope.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
    expect((await scope.sessionOf(ended.id)).failureReason).toMatch(/cumulative counter decreased/);
  });
}
