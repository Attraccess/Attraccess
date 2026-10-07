import { ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsDoesNotPublishAPendingStartAfterItsFlowHasTriggeredMaintenance(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('does not publish a pending start after its flow has triggered maintenance', async () => {
    scope.maintenance.hasActiveMaintenance.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    scope.flow.runFlow.mockImplementation(async (resourceId) => {
      await scope.operating.transition(resourceId, 'operating', {
        flowNodeId: 'observed-operation',
        flowRunId: 'maintenance-triggered',
      });
    });

    await expect(scope.usage.startSession(1, scope.users[0], { notes: 'Pending start' })).rejects.toThrow(
      'ResourceMaintenanceInUseException',
    );

    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(scope.billing.handleResourceUsageStart).not.toHaveBeenCalled();
    expect(scope.flow.trackResourceActivity).not.toHaveBeenCalled();
  });
}
