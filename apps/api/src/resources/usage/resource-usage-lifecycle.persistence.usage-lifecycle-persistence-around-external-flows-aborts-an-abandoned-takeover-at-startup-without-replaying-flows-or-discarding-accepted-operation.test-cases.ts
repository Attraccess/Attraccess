import { ResourceFormAction, ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsAbortsAnAbandonedTakeoverAtStartupWithoutReplayingFlowsOrDiscardingAcceptedOperation(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('aborts an abandoned takeover at startup without replaying flows or discarding accepted operation', async () => {
    await scope.migrateIntegrity();
    const previous = await scope.seedActiveSession();
    const before = await scope.publishedState();
    const candidate = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 2,
      startTime: new Date(),
      endTime: null,
      lifecyclePending: true,
      isFinalized: false,
    });
    await scope.source.getRepository(ResourceUsageLifecycleAttempt).save({
      id: 'abandoned-attempt',
      resourceId: 1,
      kind: 'takeover',
      previousUsageId: previous.id,
      candidateUsageId: candidate.id,
      transitionTime: candidate.startTime,
      formSubmissions: [
        { formId: 11, resourceUsageId: candidate.id, userId: 2, action: ResourceFormAction.TAKEOVER, data: {} },
      ],
      billingItems: [{ ...scope.draftItem, usageId: previous.id }],
    });
    await scope.operating.transition(1, 'operating', { flowNodeId: 'observed-operation', flowRunId: 'failed-flow' });

    await scope.usage.onModuleInit();

    expect(await scope.publishedState()).toEqual(before);
    expect(scope.flow.runFlow).not.toHaveBeenCalled();
    await scope.expectObservationAndNoAttempt();
    await scope.usage.recoverInterruptedLifecycles();
    expect(await scope.publishedState()).toEqual(before);
    expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual([]);
  });
}
