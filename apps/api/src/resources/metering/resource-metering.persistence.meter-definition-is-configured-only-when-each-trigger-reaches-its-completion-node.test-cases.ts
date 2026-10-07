import { ResourceFlowEdge } from '@attraccess/database-entities';
import { MeterDefinitionTestScope } from './resource-metering.persistence.spec';
export function registerMeterDefinitionIsConfiguredOnlyWhenEachTriggerReachesItsCompletionNode(
  scope: MeterDefinitionTestScope,
): void {
  it('is configured only when each trigger reaches its completion node', async () => {
    expect(await scope.metering.getDefinition(1, 1)).toEqual(
      expect.objectContaining({ configured: false, problems: ['start-trigger-missing', 'collect-trigger-missing'] }),
    );
    await scope.seedMeter();
    expect(await scope.metering.getDefinition(1, 1)).toEqual(
      expect.objectContaining({ configured: true, problems: [] }),
    );
    await scope.source.getRepository(ResourceFlowEdge).delete({ id: 'e1' });
    await scope.source.getRepository(ResourceFlowEdge).delete({ id: 'e2' });
    expect((await scope.metering.getDefinition(1, 1)).problems).toEqual(['ready-unreachable', 'report-unreachable']);
  });
}
