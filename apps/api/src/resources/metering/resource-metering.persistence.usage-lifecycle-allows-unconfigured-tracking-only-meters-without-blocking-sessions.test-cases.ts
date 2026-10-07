import { ResourceMeter, ResourceMeteringSession } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleAllowsUnconfiguredTrackingOnlyMetersWithoutBlockingSessions(
  scope: UsageLifecycleTestScope,
): void {
  it('allows unconfigured tracking-only meters without blocking sessions', async () => {
    await scope.source.getRepository(ResourceMeter).update(1, { creditsPerUnit: 0 });
    await scope.start();
    await scope.end();
    expect(scope.log).not.toContain('meter:start');
    expect(scope.log).not.toContain('meter:final');
    expect(await scope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
  });
}
