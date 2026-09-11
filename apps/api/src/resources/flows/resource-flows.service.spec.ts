import { createMock } from '@golevelup/ts-jest';
import type { PluginFlowTriggerNodeDefinition } from '@attraccess/plugins-backend-sdk';
import { Resource, ResourceFlowEdge, ResourceFlowNode } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { registerPluginFlowNodes } from '../../plugin-system/plugin-flow-node-registry';
import { ResourceFlowsService } from './resource-flows.service';

it('reports invalid plugin trigger configuration when loading a saved flow', async () => {
  const definition: PluginFlowTriggerNodeDefinition = {
    type: 'plugin.validation-test.event',
    label: 'Event',
    isInput: true,
    inputs: [],
    outputs: ['output'],
    validateConfig: jest.fn().mockResolvedValue([{ field: 'channelId', message: 'Select an applied channel.' }]),
  };
  registerPluginFlowNodes('validation-test', [definition]);
  const node = Object.assign(new ResourceFlowNode(), { id: 'event', type: definition.type, data: {} });
  const service = new ResourceFlowsService(
    createMock<Repository<ResourceFlowNode>>({ find: jest.fn().mockResolvedValue([node]) }),
    createMock<Repository<ResourceFlowEdge>>({ find: jest.fn().mockResolvedValue([]) }),
    createMock<Repository<Resource>>({ findOne: jest.fn().mockResolvedValue({ id: 1 }) }),
    createMock<MqttClientService>(),
    new EventEmitter2(),
  );
  await expect(service.getResourceFlow(1)).resolves.toMatchObject({
    validationErrors: [
      { nodeId: 'event', nodeType: definition.type, field: 'channelId', message: 'Select an applied channel.' },
    ],
  });
});
