import { ResourceFlowNode } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersRejectsCumulativeReadingsAfterAnIncrementSessionDefinitionChanges(
  scope: GenericMetersTestScope,
): void {
  it('rejects cumulative readings after an increment session definition changes', async () => {
    await scope.metering.report(1, 1, { kind: 'reading', value: '100' });
    await scope.source.getRepository(ResourceFlowNode).save({
      id: 'increment-report',
      resourceId: 1,
      type: scope.T.OUTPUT_METERING_REPORT,
      data: { meterId: 1, mode: 'increment', value: '1' },
    });
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    await scope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
    // Adding fresh boundary branches cannot retroactively establish the original start baseline.
    await scope.seedMeter();
    expect(await scope.metering.getDefinition(1, 1)).toMatchObject({ configured: true, incrementOnly: false });
    await expect(scope.metering.report(1, 1, { kind: 'reading', value: '105' })).rejects.toThrow('increment-only');
    expect((await scope.metering.getLive(1)).meters[0]).toMatchObject({
      lifetimeValue: '2',
      counterValue: '102',
      session: { latestValue: '2' },
    });
    await scope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '1' });
    await scope.usage.endSession(1, scope.users[0], {} as never);
    expect((await scope.items(started.id)).transaction.amount).toBe(-90);
    expect((await scope.metering.listMeters(1))[0].lifetimeValue).toBe('3');
  });
}
