import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsAbortsAFailedStartWithoutPublishingItsCandidateFormsOrBillAndKeepsAcceptedOperation(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('aborts a failed start without publishing its candidate, forms, or bill and keeps accepted operation', async () => {
    await scope.migrateIntegrity();
    const before = await scope.publishedState();
    scope.failAfterObservation();

    await expect(scope.usage.startSession(1, scope.users[0], { notes: 'Pending start' })).rejects.toThrow(
      'Downstream external command failed',
    );

    expect(await scope.publishedState()).toEqual(before);
    await scope.expectObservationAndNoAttempt();
  });
}
