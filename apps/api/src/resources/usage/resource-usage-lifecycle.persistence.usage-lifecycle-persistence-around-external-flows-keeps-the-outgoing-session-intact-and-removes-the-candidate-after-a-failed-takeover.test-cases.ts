import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsKeepsTheOutgoingSessionIntactAndRemovesTheCandidateAfterAFailedTakeover(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('keeps the outgoing session intact and removes the candidate after a failed takeover', async () => {
    await scope.migrateIntegrity();
    await scope.seedActiveSession();
    const before = await scope.publishedState();
    scope.failAfterObservation();

    await expect(scope.usage.startSession(1, scope.users[1], { forceTakeOver: true })).rejects.toThrow(
      'Downstream external command failed',
    );

    expect(await scope.publishedState()).toEqual(before);
    await scope.expectObservationAndNoAttempt();
  });
}
