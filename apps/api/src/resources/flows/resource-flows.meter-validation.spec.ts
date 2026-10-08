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
    const nodes = types.map((type, index) =>
      Object.assign(new ResourceFlowNode(), {
        id: `meter-${index}`,
        type,
        data: { meterId, value: '42' },
        position: { x: index, y: 0 },
        resource,
      }),
    );
    const manager = createMock<EntityManager>();
    manager.existsBy.mockResolvedValue(meterBelongsToResource);
    manager.find.mockResolvedValue([]);
    manager.save.mockImplementation(async (_entity, entities) => entities);
    manager.transaction.mockImplementation(async (work: (transaction: EntityManager) => Promise<unknown>) =>
      work(manager),
    );
    const service = new ResourceFlowsService(
      createMock<Repository<ResourceFlowNode>>({ manager, find: jest.fn().mockResolvedValue(nodes) }),
      createMock<Repository<ResourceFlowEdge>>({ find: jest.fn().mockResolvedValue([]) }),
      createMock<Repository<Resource>>({ manager, findOne: jest.fn().mockResolvedValue(resource) }),
      createMock<MqttClientService>(),
      new EventEmitter2(),
    );
    return { service, nodes, manager };
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
    expect(manager.existsBy).toHaveBeenCalledTimes(types.length);
    expect(manager.existsBy).toHaveBeenCalledWith(ResourceMeter, { id: meterId, resourceId });
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
    expect(manager.existsBy).toHaveBeenCalledTimes(types.length);
    expect(manager.existsBy).toHaveBeenCalledWith(ResourceMeter, { id: meterId, resourceId });
  });
});
