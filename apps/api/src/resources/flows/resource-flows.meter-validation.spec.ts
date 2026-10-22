import { flowOperationsFake } from './persistence/operations.test-fixture';
import { createMock } from '@golevelup/ts-jest';
import { Resource, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { ResourceFlowsService } from './resource-flows.service';

describe('resource flow meter validation', () => {
  const resourceId = 7;
  const meterId = 13;
  const types = [
    ResourceFlowNodeType.INPUT_METERING_START,
    ResourceFlowNodeType.INPUT_METERING_COLLECT,
    ResourceFlowNodeType.OUTPUT_METERING_READY,
    ResourceFlowNodeType.OUTPUT_METERING_REPORT,
  ];

  function fixture(meterBelongsToResource: boolean) {
    const resource = Object.assign({} as Resource, { id: resourceId });
    const nodes: ResourceFlowNode[] = types.map((type, index) =>
      Object.assign({} as ResourceFlowNode, {
        id: `meter-${index}`,
        type,
        data: { meterId, value: '42' },
        position: { x: index, y: 0 },
        resource,
      }),
    );
    const fake = flowOperationsFake();
    const meters = meterBelongsToResource ? [meterId] : [];
    fake.persistence.findResource.mockResolvedValue(resource);
    fake.persistence.graphNodes.mockResolvedValue(nodes);
    fake.persistence.meterIds.mockImplementation(async () => [...meters]);
    const service = new ResourceFlowsService(
      fake.persistence,
      fake.driver.transactions,
      createMock<MqttClientService>(),
      new EventEmitter2(),
    );
    return { service, nodes, persistence: fake.persistence, meters };
  }

  function expectOneMeterRead(persistence: ReturnType<typeof fixture>['persistence']) {
    expect(persistence.meterIds).toHaveBeenCalledTimes(1);
    expect(persistence.meterIds).toHaveBeenCalledWith(resourceId);
  }

  it.each(['load', 'save'])('reports meters outside the resource during %s', async (operation) => {
    const { service, nodes, persistence } = fixture(false);
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] });

    expect(result.validationErrors).toEqual(
      nodes.map((node) => ({
        nodeId: node.id,
        nodeType: node.type,
        field: 'meterId',
        message: 'Choose a meter belonging to this resource',
      })),
    );
    expectOneMeterRead(persistence);
    // Invalid flows remain editable drafts, with the warnings returned to the editor.
    expect(result.nodes).toHaveLength(types.length);
  });

  it.each(['load', 'save'])('accepts meters belonging to the resource during %s', async (operation) => {
    const { service, nodes, persistence } = fixture(true);
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] });

    expect(result.validationErrors).toBeUndefined();
    expectOneMeterRead(persistence);
  });

  it.each(['load', 'save'])('checks distinct and repeated meters with one query during %s', async (operation) => {
    const { service, nodes, persistence, meters } = fixture(true);
    meters.push(meterId + 1);
    nodes[1].data = { meterId: meterId + 1 };
    nodes[2].data = { meterId: meterId + 2 };
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] });

    expect(result.validationErrors).toEqual([
      {
        nodeId: nodes[2].id,
        nodeType: nodes[2].type,
        field: 'meterId',
        message: 'Choose a meter belonging to this resource',
      },
    ]);
    expectOneMeterRead(persistence);
  });

  it.each(['load', 'save'])('refreshes meter ownership on each %s request', async (operation) => {
    const { service, nodes, persistence, meters } = fixture(true);
    const run = () =>
      operation === 'load'
        ? service.getResourceFlow(resourceId)
        : service.saveResourceFlow(resourceId, { nodes, edges: [] });
    expect((await run()).validationErrors).toBeUndefined();
    meters.length = 0;

    expect((await run()).validationErrors).toHaveLength(types.length);
    expect(persistence.meterIds).toHaveBeenCalledTimes(2);
  });

  it.each(['load', 'save'])('skips meter queries for an empty flow during %s', async (operation) => {
    const { service, nodes, persistence } = fixture(true);
    nodes.length = 0;
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] });

    expect(result.validationErrors).toBeUndefined();
    expect(persistence.meterIds).not.toHaveBeenCalled();
  });

  it.each(['load', 'save'])('skips meter queries for non-metering nodes during %s', async (operation) => {
    const { service, nodes, persistence } = fixture(true);
    nodes.forEach((node) => {
      node.type = ResourceFlowNodeType.INPUT_BUTTON;
      node.data = { label: 'Start' };
    });
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] });

    expect(result.validationErrors).toBeUndefined();
    expect(persistence.meterIds).not.toHaveBeenCalled();
  });

  it.each(['load', 'save'])('skips meter queries for malformed metering data during %s', async (operation) => {
    const { service, nodes, persistence } = fixture(true);
    nodes.forEach((node) => (node.data = { meterId: 0, value: '42' }));
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] });

    expect(result.validationErrors).toHaveLength(types.length);
    expect(persistence.meterIds).not.toHaveBeenCalled();
  });

  it.each(['load', 'save'])('reports a failed lookup without retrying per node during %s', async (operation) => {
    const { service, nodes, persistence } = fixture(true);
    persistence.meterIds.mockRejectedValueOnce(new Error('Meter lookup failed'));
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] });

    expect(result.validationErrors).toEqual(
      nodes.map((node) => ({
        nodeId: node.id,
        nodeType: node.type,
        field: 'data',
        message: 'Meter lookup failed',
        value: node.data,
      })),
    );
    expectOneMeterRead(persistence);
  });
});
