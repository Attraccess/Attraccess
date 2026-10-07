import { ResourceMeter, ResourceUsage } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleDoesNotStartAnUnmeteredBilledSessionWhenTheMeterIsNotConfigured(
  scope: UsageLifecycleTestScope,
): void {
  it('does not start an unmetered billed session when the meter is not configured', async () => {
    await scope.source.getRepository(ResourceMeter).update(1, { name: 'Heartbeats' });
    await expect(scope.start()).rejects.toThrow(
      expect.objectContaining({ message: 'METER_INITIALIZATION_FAILED: METER_NOT_CONFIGURED: Heartbeats' }),
    );
    expect(scope.log).toEqual([]);
    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
  });
}
