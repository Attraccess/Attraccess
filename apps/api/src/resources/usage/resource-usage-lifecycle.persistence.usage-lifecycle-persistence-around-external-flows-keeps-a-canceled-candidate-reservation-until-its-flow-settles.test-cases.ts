import { ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsKeepsACanceledCandidateReservationUntilItsFlowSettles(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('keeps a canceled candidate reservation until its flow settles', async () => {
    let releaseFlow!: () => void;
    const flowSettled = new Promise<void>((resolve) => {
      releaseFlow = resolve;
    });
    let candidateCancelled!: () => void;
    const cancellationComplete = new Promise<void>((resolve) => {
      candidateCancelled = resolve;
    });
    scope.flow.runFlow.mockImplementation(async (_resourceId, _trigger, _payload, _manager, { lifecycleAttemptId }) => {
      await scope.usage.cancelLifecycleCandidate(lifecycleAttemptId, 1);
      candidateCancelled();
      await flowSettled;
    });

    const firstStart = scope.usage.startSession(1, scope.users[0], { notes: 'Ended by flow' });
    await cancellationComplete;

    await expect(scope.usage.startSession(1, scope.users[1], { notes: 'Competing start' })).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );

    releaseFlow();
    await expect(firstStart).rejects.toThrow('The tentative usage session was cancelled');
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
  });
}
