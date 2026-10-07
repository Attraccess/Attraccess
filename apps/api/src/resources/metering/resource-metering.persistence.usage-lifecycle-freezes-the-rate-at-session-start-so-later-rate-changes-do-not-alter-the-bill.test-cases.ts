import { ResourceMeter } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleFreezesTheRateAtSessionStartSoLaterRateChangesDoNotAlterTheBill(
  scope: UsageLifecycleTestScope,
): void {
  it('freezes the rate at session start so later rate changes do not alter the bill', async () => {
    await scope.seedMeter();
    await scope.start();
    await scope.source.getRepository(ResourceMeter).update(1, { creditsPerUnit: 90 });
    scope.onCollect = scope.reading('1.5');
    const ended = await scope.end();
    expect((await scope.items(ended.id)).transaction.amount).toBe(-45);
  });
}
