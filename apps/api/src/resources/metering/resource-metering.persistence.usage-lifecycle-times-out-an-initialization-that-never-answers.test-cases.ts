import { ResourceMeteringSession, ResourceUsage } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleTimesOutAnInitializationThatNeverAnswers(scope: UsageLifecycleTestScope): void {
  it('times out an initialization that never answers', async () => {
    await scope.seedMeter({ timeoutSeconds: 1 });
    scope.onStart = () => new Promise(() => undefined);
    await expect(scope.start()).rejects.toThrow(
      expect.objectContaining({ message: expect.stringMatching(/^METER_INITIALIZATION_FAILED/) }),
    );
    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
  }, 10_000);
}
