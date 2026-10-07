import {
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleRemovesTheSessionOfAnInterruptedStartDuringRestartRecovery(
  scope: UsageLifecycleTestScope,
): void {
  it('removes the session of an interrupted start during restart recovery', async () => {
    await scope.seedMeter();
    const candidate = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      isFinalized: false,
      lifecyclePending: true,
    });
    await scope.source.getRepository(ResourceUsageLifecycleAttempt).save({
      id: 'attempt',
      resourceId: 1,
      kind: 'start',
      candidateUsageId: candidate.id,
      previousUsageId: null,
      transitionTime: new Date(),
      formSubmissions: [],
      billingItems: [],
    });
    await scope.source.getRepository(ResourceMeteringSession).save({
      id: 's1',
      resourceId: 1,
      usageId: candidate.id,
      status: ResourceMeteringSessionStatus.Active,
      creditsPerUnit: 30,
    });
    await scope.usage.recoverInterruptedLifecycles();
    expect(await scope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
  });
}
