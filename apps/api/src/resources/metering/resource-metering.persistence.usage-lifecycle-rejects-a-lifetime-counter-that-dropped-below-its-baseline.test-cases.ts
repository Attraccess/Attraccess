import { ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleRejectsALifetimeCounterThatDroppedBelowItsBaseline(
  scope: UsageLifecycleTestScope,
): void {
  it('rejects a lifetime counter that dropped below its baseline', async () => {
    await scope.seedMeter({}, { finalAttempts: 1 });
    scope.onStart = ({ complete }) => complete({ kind: 'ready', baseline: { value: '1000' } });
    await scope.start();
    scope.onCollect = scope.reading('12');
    const ended = await scope.end();
    expect((await scope.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Pending);
    expect((await scope.sessionOf(ended.id)).failureReason).toMatch(/cumulative counter decreased/);
  });
}
