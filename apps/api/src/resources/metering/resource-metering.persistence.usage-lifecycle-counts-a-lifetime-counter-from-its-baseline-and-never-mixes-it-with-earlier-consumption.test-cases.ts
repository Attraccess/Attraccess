import { ResourceMeteringSession } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleCountsALifetimeCounterFromItsBaselineAndNeverMixesItWithEarlierConsumption(
  scope: UsageLifecycleTestScope,
): void {
  it('counts a lifetime counter from its baseline and never mixes it with earlier consumption', async () => {
    await scope.seedMeter();
    scope.onStart = ({ complete }) => complete({ kind: 'ready', baseline: { value: '1000' }, source: 'grid-meter' });
    await scope.start();
    expect(
      (await scope.source.getRepository(ResourceMeteringSession).findOneByOrFail({ resourceId: 1 })).baselineValue,
    ).toBe('1000000000000');
    scope.onCollect = scope.reading('1001.5', { source: 'grid-meter' });
    const ended = await scope.end();
    const { transaction } = await scope.items(ended.id);
    expect(transaction.amount).toBe(-45);
    expect((await scope.sessionOf(ended.id)).consumedValue).toBe('1500000000');
  });
}
