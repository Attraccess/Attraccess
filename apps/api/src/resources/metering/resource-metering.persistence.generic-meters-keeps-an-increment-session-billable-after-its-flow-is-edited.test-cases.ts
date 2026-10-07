import { ResourceFlowNode, ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersKeepsAnIncrementSessionBillableAfterItsFlowIsEdited(
  scope: GenericMetersTestScope,
): void {
  it('keeps an increment session billable after its flow is edited', async () => {
    await scope.seedMeter();
    await scope.source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
    await scope.source.getRepository(ResourceFlowNode).save({
      id: 'increment-report',
      resourceId: 1,
      type: scope.T.OUTPUT_METERING_REPORT,
      data: { meterId: 1, mode: 'increment', value: '1' },
    });
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    await scope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
    await scope.source.getRepository(ResourceFlowNode).delete({ resourceId: 1 });
    await scope.usage.endSession(1, scope.users[0], {} as never);
    expect((await scope.items(started.id)).transaction.amount).toBe(-60);
    expect((await scope.sessionOf(started.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
  });
}
