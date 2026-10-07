import { ResourceMeter, ResourceFlowNode, ResourceMeteringSession } from '@attraccess/database-entities';
import { OperationsTestScope } from './resource-metering.persistence.spec';
export function registerOperationsRecordsInterimReadingsForDisplayOnlyAndSkipsBusyOrDisabledMeters(
  scope: OperationsTestScope,
): void {
  it('records interim readings for display only and skips busy or disabled meters', async () => {
    const session = await scope.activeSession();
    await scope.source
      .getRepository(ResourceMeteringSession)
      .update(session.id, { createdAt: new Date(Date.now() - 3_600_000) });
    await scope.source.getRepository(ResourceMeter).update(1, { latestObservedAt: new Date(Date.now() - 3_600_000) });
    scope.onCollect = scope.reading('0.7');
    await scope.metering.collectInterimReadings();
    expect((await scope.metering.getLive(1)).meters[0].session).toEqual(
      expect.objectContaining({ latestValue: '0.7' }),
    );

    await scope.source
      .getRepository(ResourceMeteringSession)
      .update(session.id, { latestObservedAt: new Date(Date.now() - 3_600_000) });
    await scope.source
      .getRepository(ResourceFlowNode)
      .update({ id: 'collect' }, { data: { meterId: 1, interimIntervalMinutes: 0 } });
    scope.onCollect = scope.reading('0.9');
    await scope.metering.collectInterimReadings();
    expect((await scope.metering.getLive(1)).meters[0].session).toEqual(
      expect.objectContaining({ latestValue: '0.7' }),
    );
  });
}
