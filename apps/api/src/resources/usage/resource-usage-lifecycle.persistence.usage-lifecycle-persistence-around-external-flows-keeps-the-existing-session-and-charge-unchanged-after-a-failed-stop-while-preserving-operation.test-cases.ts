import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsKeepsTheExistingSessionAndChargeUnchangedAfterAFailedStopWhilePreservingOperation(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('keeps the existing session and charge unchanged after a failed stop while preserving operation', async () => {
    await scope.seedActiveSession();
    const before = await scope.publishedState();
    scope.failAfterObservation();

    await expect(scope.usage.endSession(1, scope.users[0], { notes: 'Pending stop' })).rejects.toThrow(
      'Downstream external command failed',
    );

    expect(await scope.publishedState()).toEqual(before);
    await scope.expectObservationAndNoAttempt();
  });
}
