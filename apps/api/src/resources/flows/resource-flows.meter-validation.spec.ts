import { createMock } from '@golevelup/ts-jest';
import {
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceMeter,
} from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityManager, Repository } from 'typeorm';
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
    const resource = Object.assign(new Resource(), { id: resourceId });
    const nodes: ResourceFlowNode[] = types.map((type, index) =>
      Object.assign(new ResourceFlowNode(), {
        id: `meter-${index}`,
        type,
        data: { meterId, value: '42' },
        position: { x: index, y: 0 },
        resource,
      }),
    );
    const manager = createMock<EntityManager>();
    const meters = meterBelongsToResource ? [Object.assign(new ResourceMeter(), { id: meterId })] : [];
    manager.find.mockImplementation(async (entity) => (entity === ResourceMeter ? meters : []));
    manager.save.mockImplementation(async (_entity, entities) => entities);
    manager.transaction.mockImplementation(
      async (
        workOrIsolation: string | ((transaction: EntityManager) => Promise<unknown>),
        work?: (transaction: EntityManager) => Promise<unknown>,
      ) => {
        if (typeof workOrIsolation === 'function') return workOrIsolation(manager);
        if (!work) throw new Error('Missing transaction callback');
        return work(manager);
      },
    );
    const service = new ResourceFlowsService(
      createMock<Repository<ResourceFlowNode>>({ manager, find: jest.fn().mockResolvedValue(nodes) }),
      createMock<Repository<ResourceFlowEdge>>({ find: jest.fn().mockResolvedValue([]) }),
      createMock<Repository<Resource>>({ manager, findOne: jest.fn().mockResolvedValue(resource) }),
      createMock<MqttClientService>(),
      new EventEmitter2(),
    );
    return { service, nodes, manager, meters };
  }

  function expectOneMeterQuery(manager: ReturnType<typeof fixture>['manager']) {
    expect(manager.find.mock.calls.filter(([entity]) => entity === ResourceMeter)).toHaveLength(1);
    expect(manager.find).toHaveBeenCalledWith(ResourceMeter, { where: { resourceId }, select: { id: true } });
    expect(manager.existsBy).not.toHaveBeenCalled();
  }

  it.each(['load', 'save'])('reports meters outside the resource during %s', async (operation) => {
    const { service, nodes, manager } = fixture(false);
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
    expectOneMeterQuery(manager);
    // Invalid flows remain editable drafts, with the warnings returned to the editor.
    expect(result.nodes).toHaveLength(types.length);
  });

  it.each(['load', 'save'])('accepts meters belonging to the resource during %s', async (operation) => {
    const { service, nodes, manager } = fixture(true);
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] });

    expect(result.validationErrors).toBeUndefined();
    expectOneMeterQuery(manager);
  });

  it.each(['load', 'save'])('checks distinct and repeated meters with one query during %s', async (operation) => {
    const { service, nodes, manager, meters } = fixture(true);
    meters.push(Object.assign(new ResourceMeter(), { id: meterId + 1 }));
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
    expectOneMeterQuery(manager);
  });

  it.each(['load', 'save'])('refreshes meter ownership on each %s request', async (operation) => {
    const { service, nodes, manager, meters } = fixture(true);
    const run = () =>
      operation === 'load'
        ? service.getResourceFlow(resourceId)
        : service.saveResourceFlow(resourceId, { nodes, edges: [] });
    expect((await run()).validationErrors).toBeUndefined();
    meters.length = 0;

    expect((await run()).validationErrors).toHaveLength(types.length);
    expect(manager.find.mock.calls.filter(([entity]) => entity === ResourceMeter)).toHaveLength(2);
  });

  it.each(['load', 'save'])('skips meter queries for an empty flow during %s', async (operation) => {
    const { service, nodes, manager } = fixture(true);
    nodes.length = 0;
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] });

    expect(result.validationErrors).toBeUndefined();
    expect(manager.find).not.toHaveBeenCalledWith(ResourceMeter, expect.anything());
  });

  it.each(['load', 'save'])('skips meter queries for non-metering nodes during %s', async (operation) => {
    const { service, nodes, manager } = fixture(true);
    nodes.forEach((node) => {
      node.type = ResourceFlowNodeType.INPUT_BUTTON;
      node.data = { label: 'Start' };
    });
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] });

    expect(result.validationErrors).toBeUndefined();
    expect(manager.find).not.toHaveBeenCalledWith(ResourceMeter, expect.anything());
  });

  it.each(['load', 'save'])('skips meter queries for malformed metering data during %s', async (operation) => {
    const { service, nodes, manager } = fixture(true);
    nodes.forEach((node) => (node.data = { meterId: 0, value: '42' }));
    const result =
      operation === 'load'
        ? await service.getResourceFlow(resourceId)
        : await service.saveResourceFlow(resourceId, { nodes, edges: [] });

    expect(result.validationErrors).toHaveLength(types.length);
    expect(manager.find).not.toHaveBeenCalledWith(ResourceMeter, expect.anything());
  });

  it.each(['load', 'save'])('reports a failed lookup without retrying per node during %s', async (operation) => {
    const { service, nodes, manager } = fixture(true);
    manager.find.mockRejectedValueOnce(new Error('Meter lookup failed'));
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
    expectOneMeterQuery(manager);
  });
});
