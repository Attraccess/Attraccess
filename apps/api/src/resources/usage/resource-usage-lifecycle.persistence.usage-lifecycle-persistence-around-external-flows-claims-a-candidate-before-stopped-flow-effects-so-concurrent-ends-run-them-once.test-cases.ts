import { ResourceUsage, ResourceUsageAction, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsClaimsACandidateBeforeStoppedFlowEffectsSoConcurrentEndsRunThemOnce(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('claims a candidate before stopped-flow effects so concurrent ends run them once', async () => {
    const candidate = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date(),
      endTime: null,
      lifecyclePending: true,
      isFinalized: false,
    });
    await scope.source.getRepository(ResourceUsageLifecycleAttempt).save({
      id: 'candidate-cancellation',
      resourceId: 1,
      kind: 'start',
      previousUsageId: null,
      candidateUsageId: candidate.id,
      transitionTime: candidate.startTime,
      formSubmissions: [],
      billingItems: [],
    });
    let releaseFlow!: () => void;
    const flowSettled = new Promise<void>((resolve) => {
      releaseFlow = resolve;
    });
    let stoppedFlowStarted!: () => void;
    const stoppedFlowStartedPromise = new Promise<void>((resolve) => {
      stoppedFlowStarted = resolve;
    });
    scope.flow.runFlow.mockImplementation(async () => {
      stoppedFlowStarted();
      await flowSettled;
    });

    const firstEnd = scope.usage.endLifecycleCandidate('candidate-cancellation', 1, 'Stopped');
    await stoppedFlowStartedPromise;
    const secondEnd = scope.usage.endLifecycleCandidate('candidate-cancellation', 1, 'Stopped');

    await expect(secondEnd).rejects.toThrow('The usage lifecycle attempt has no candidate session');
    expect(scope.flow.runFlow).toHaveBeenCalledTimes(1);
    expect(await scope.source.getRepository(ResourceUsage).findOneBy({ id: candidate.id })).toBeNull();
    await expect(
      scope.source.getRepository(ResourceUsageLifecycleAttempt).findOneByOrFail({ id: 'candidate-cancellation' }),
    ).resolves.toMatchObject({ candidateUsageId: null });

    releaseFlow();
    await expect(firstEnd).resolves.toBeUndefined();
  });
}
