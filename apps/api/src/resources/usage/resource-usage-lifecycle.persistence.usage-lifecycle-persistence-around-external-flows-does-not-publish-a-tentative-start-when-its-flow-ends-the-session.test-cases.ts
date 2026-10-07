import { ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsDoesNotPublishATentativeStartWhenItsFlowEndsTheSession(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('does not publish a tentative start when its flow ends the session', async () => {
    scope.flow.runFlow.mockImplementation(async (_resourceId, _trigger, _payload, _manager, { lifecycleAttemptId }) => {
      await scope.usage.cancelLifecycleCandidate(lifecycleAttemptId, 1);
    });

    await expect(scope.usage.startSession(1, scope.users[0], { notes: 'Ended by flow' })).rejects.toThrow(
      'The tentative usage session was cancelled',
    );

    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(scope.billing.handleResourceUsageStart).not.toHaveBeenCalled();
    expect(scope.flow.trackResourceActivity).not.toHaveBeenCalled();
  });
}
