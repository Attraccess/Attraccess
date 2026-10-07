import { ResourceFlowEdge, ResourceFlowNode } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersLoadsOneFlowSnapshotForAllMetersInAStatusPoll(
  scope: GenericMetersTestScope,
): void {
  it('loads one flow snapshot for all meters in a status poll', async () => {
    await scope.seedMeter();
    await scope.metering.createMeter(1, 'Heartbeats');
    const nodes = jest.spyOn(scope.source.getRepository(ResourceFlowNode), 'find');
    const edges = jest.spyOn(scope.source.getRepository(ResourceFlowEdge), 'find');
    expect((await scope.metering.getStatus(1)).meters).toHaveLength(2);
    expect(nodes).toHaveBeenCalledTimes(1);
    expect(edges).toHaveBeenCalledTimes(1);
  });
}
