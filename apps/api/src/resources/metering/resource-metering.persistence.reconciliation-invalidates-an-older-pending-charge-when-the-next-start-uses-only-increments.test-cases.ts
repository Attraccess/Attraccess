import { ResourceFlowNode, ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { ReconciliationTestScope } from './resource-metering.persistence.spec';
export function registerReconciliationInvalidatesAnOlderPendingChargeWhenTheNextStartUsesOnlyIncrements(
  scope: ReconciliationTestScope,
): void {
  it('invalidates an older pending charge when the next start uses only increments', async () => {
    const ended = await scope.endWithMissingFinal();
    const session = await scope.parentScope.sessionOf(ended.id);
    await scope.parentScope.source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
    await scope.parentScope.source.getRepository(ResourceFlowNode).save({
      id: 'increment-report',
      type: scope.parentScope.T.OUTPUT_METERING_REPORT,
      resourceId: 1,
      data: { meterId: 1, mode: 'increment', value: '1' },
    });
    const startFlow = jest.fn(scope.parentScope.ready);
    scope.parentScope.onStart = startFlow;

    const started = await scope.start(scope.parentScope.users[1]);
    expect((await scope.parentScope.sessionOf(started.id)).collectionMode).toBe('increment');
    expect(startFlow).not.toHaveBeenCalled();
    expect((await scope.parentScope.sessionOf(ended.id)).status).toBe(ResourceMeteringSessionStatus.Failed);
    expect((await scope.parentScope.metering.getStatus(1)).unsettled).toEqual([
      expect.objectContaining({ sessionId: session.id, retryable: false }),
    ]);
  });
}
