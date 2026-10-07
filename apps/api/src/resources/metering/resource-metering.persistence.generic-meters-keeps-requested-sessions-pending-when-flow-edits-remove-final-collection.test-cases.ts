import { ResourceFlowNode, ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersKeepsRequestedSessionsPendingWhenFlowEditsRemoveFinalCollection(
  scope: GenericMetersTestScope,
): void {
  it('keeps requested sessions pending when flow edits remove final collection', async () => {
    await scope.seedMeter();
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    await scope.metering.report(1, 1, { kind: 'reading', value: '2' });
    await scope.source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
    await scope.source.getRepository(ResourceFlowNode).save({
      id: 'increment-report',
      resourceId: 1,
      type: scope.T.OUTPUT_METERING_REPORT,
      data: { meterId: 1, mode: 'increment', value: '1' },
    });
    scope.onCollect = async () => {
      throw new Error('The collection branch was removed');
    };
    const definition = await scope.metering.getDefinition(1, 1);
    expect(definition.incrementOnly).toBe(true);
    // Skip the default retry delay in this unavailable-collection regression.
    jest.spyOn(scope.metering, 'getDefinition').mockResolvedValue({
      ...definition,
      collect: { ...definition.collect, finalAttempts: 1, finalRetryDelaySeconds: 0 },
    });
    await scope.usage.endSession(1, scope.users[0], {} as never);
    expect(await scope.sessionOf(started.id)).toMatchObject({
      collectionMode: 'requested',
      status: ResourceMeteringSessionStatus.Pending,
      latestValue: '2000000000',
      chargeCredits: null,
    });
    expect((await scope.items(started.id)).transaction.amount).toBe(0);
  });
}
