import { ResourceMeteringSession } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersAllowsResourceUsageWhenATrackingOnlyStartFails(
  scope: GenericMetersTestScope,
): void {
  it('allows resource usage when a tracking-only start fails', async () => {
    await scope.seedMeter();
    await scope.metering.setRate(1, 1, 0);
    scope.onStart = async () => {
      throw new Error('offline');
    };
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    expect(started.endTime).toBeNull();
    expect(await scope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
    await scope.usage.endSession(1, scope.users[0], {} as never);
    expect((await scope.items(started.id)).transaction.amount).toBe(0);
  });
}
