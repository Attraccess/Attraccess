import { ResourceFlowNode, ResourceMeteringSession } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersRejectsMixedPushOnlyDefinitionsWithASReport(scope: GenericMetersTestScope): void {
  it.each(['total', undefined])('rejects mixed push-only definitions with a %s report', async (mode) => {
    await scope.metering.report(1, 1, { kind: 'reading', value: '100' });
    await scope.source.getRepository(ResourceFlowNode).save([
      {
        id: 'increment-report',
        resourceId: 1,
        type: scope.T.OUTPUT_METERING_REPORT,
        data: { meterId: 1, mode: 'increment', value: '1' },
      },
      {
        id: 'total-report',
        resourceId: 1,
        type: scope.T.OUTPUT_METERING_REPORT,
        data: { meterId: 1, mode, value: '105' },
      },
    ]);
    expect(await scope.metering.getDefinition(1, 1)).toMatchObject({ configured: false, incrementOnly: false });
    await expect(scope.usage.startSession(1, scope.users[0], {} as never)).rejects.toThrow('METER_NOT_CONFIGURED');
    expect(await scope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
    expect((await scope.metering.getLive(1)).meters[0]).toMatchObject({ lifetimeValue: '0', counterValue: '100' });
  });
}
