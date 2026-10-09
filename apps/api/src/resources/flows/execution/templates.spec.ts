import { Resource, ResourceFlowEdge, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { Repository } from 'typeorm';

import { MqttClientService } from '../../../mqtt/mqtt-client.service';

import { inheritTestScope } from '../../../test-utils/inherit-test-scope';

import { ResourceHealthService } from '../../health/resource-health.service';

import { ResourceUsageService } from '../../usage/sessions/resource-usage.service';

import { FlowLogRecorderService } from '../logs/flow-log-recorder.service';

import { ResourceFlowVariablesService } from '../variables/resource-flow-variables.service';

import { ResourceFlowsExecutorService } from './resource-flows-executor.service';

import { resetTestFixture } from './fixtures/setup.test-fixture';

import { createNode } from './fixtures/node.test-fixture';

import { Edge } from './fixtures/edge.test-fixture';

jest.mock('axios');

export type ResourceFlowsExecutorServiceRunFlowTestScope = {
  initialNodes: ResourceFlowNode[];
  createNode: typeof createNode;
  mqttClientService: MqttClientService;
  service: ResourceFlowsExecutorService;
  resourceUsageService: ResourceUsageService;
  nodesById: Record<string, ResourceFlowNode>;
  errorShapeIndex: number;
  edgesBySourceAndHandle: Record<string, Edge[]>;
  flowLogs: FlowLogRecorderService;
  operatingIntervals: { transition: jest.Mock };
  flowNodeRepository: Partial<Repository<ResourceFlowNode>>;
  flowEdgeRepository: Partial<Repository<Edge>>;
  resourceRepository: Partial<Repository<Resource>>;
  eventEmitter: EventEmitter2;
  resourceHealthService: ResourceHealthService;
  variablesService: ResourceFlowVariablesService;
};

export type ResourceFlowsExecutorServiceMqttTestScope = {
  initialNodes: ResourceFlowNode[];
  service: ResourceFlowsExecutorService;
  nodesById: Record<string, ResourceFlowNode>;
  edgesBySourceAndHandle: Record<string, { source: string; target: string; sourceHandle?: string | null }[]>;
  eventEmitter: EventEmitter2;
  mqttClientService: MqttClientService;
  flowLogs: FlowLogRecorderService;
  createNode: typeof createNode;
  flowNodeRepository: Partial<Repository<ResourceFlowNode>>;
  flowEdgeRepository: Partial<Repository<ResourceFlowEdge>>;
  resourceRepository: Partial<Repository<Resource>>;
  resourceUsageService: ResourceUsageService;
  resourceHealthService: ResourceHealthService;
  variablesService: ResourceFlowVariablesService;
};

// Minimal edge shape for our mocks
// Helper to create a node
describe('ResourceFlowsExecutorService.runFlow', () => {
  let errorShapeIndex = 0;

  let service: ResourceFlowsExecutorService;

  // Repositories and dependencies
  let flowNodeRepository: Partial<Repository<ResourceFlowNode>>;

  let flowEdgeRepository: Partial<Repository<Edge>>;

  let flowLogs: FlowLogRecorderService;

  let resourceRepository: Partial<Repository<Resource>>;

  let mqttClientService: MqttClientService;

  let resourceUsageService: ResourceUsageService;

  let eventEmitter: EventEmitter2;

  let resourceHealthService: ResourceHealthService;

  let variablesService: ResourceFlowVariablesService;

  let operatingIntervals: { transition: jest.Mock };

  // Dynamic stores per test
  let nodesById: Record<string, ResourceFlowNode>;

  let initialNodes: ResourceFlowNode[];

  const scope = {
    get initialNodes() {
      return initialNodes;
    },
    set initialNodes(value: typeof initialNodes) {
      initialNodes = value;
    },
    get createNode() {
      return createNode;
    },
    get mqttClientService() {
      return mqttClientService;
    },
    set mqttClientService(value: typeof mqttClientService) {
      mqttClientService = value;
    },
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get resourceUsageService() {
      return resourceUsageService;
    },
    set resourceUsageService(value: typeof resourceUsageService) {
      resourceUsageService = value;
    },
    get nodesById() {
      return nodesById;
    },
    set nodesById(value: typeof nodesById) {
      nodesById = value;
    },
    get errorShapeIndex() {
      return errorShapeIndex;
    },
    set errorShapeIndex(value: typeof errorShapeIndex) {
      errorShapeIndex = value;
    },
    get edgesBySourceAndHandle() {
      return edgesBySourceAndHandle;
    },
    set edgesBySourceAndHandle(value: typeof edgesBySourceAndHandle) {
      edgesBySourceAndHandle = value;
    },
    get flowLogs() {
      return flowLogs;
    },
    set flowLogs(value: typeof flowLogs) {
      flowLogs = value;
    },
    get operatingIntervals() {
      return operatingIntervals;
    },
    set operatingIntervals(value: typeof operatingIntervals) {
      operatingIntervals = value;
    },
    get flowNodeRepository() {
      return flowNodeRepository;
    },
    set flowNodeRepository(value: typeof flowNodeRepository) {
      flowNodeRepository = value;
    },
    get flowEdgeRepository() {
      return flowEdgeRepository;
    },
    set flowEdgeRepository(value: typeof flowEdgeRepository) {
      flowEdgeRepository = value;
    },
    get resourceRepository() {
      return resourceRepository;
    },
    set resourceRepository(value: typeof resourceRepository) {
      resourceRepository = value;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    set eventEmitter(value: typeof eventEmitter) {
      eventEmitter = value;
    },
    get resourceHealthService() {
      return resourceHealthService;
    },
    set resourceHealthService(value: typeof resourceHealthService) {
      resourceHealthService = value;
    },
    get variablesService() {
      return variablesService;
    },
    set variablesService(value: typeof variablesService) {
      variablesService = value;
    },
  };

  let edgesBySourceAndHandle: Record<string, Edge[]>;
  // key: `${source}|${handle ?? ''}`

  beforeEach(() => {
    resetTestFixture(scope);
  });

  describe('arithmetic templates', () => {
    const arithmeticTemplatesScope = inheritTestScope(
      {
        get variablesService() {
          return scope.variablesService;
        },
        set variablesService(value: typeof scope.variablesService) {
          scope.variablesService = value;
        },
        get createNode() {
          return scope.createNode;
        },
        get initialNodes() {
          return scope.initialNodes;
        },
        set initialNodes(value: typeof scope.initialNodes) {
          scope.initialNodes = value;
        },
        get nodesById() {
          return scope.nodesById;
        },
        set nodesById(value: typeof scope.nodesById) {
          scope.nodesById = value;
        },
        get edgesBySourceAndHandle() {
          return scope.edgesBySourceAndHandle;
        },
        set edgesBySourceAndHandle(value: typeof scope.edgesBySourceAndHandle) {
          scope.edgesBySourceAndHandle = value;
        },
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get mqttClientService() {
          return scope.mqttClientService;
        },
        set mqttClientService(value: typeof scope.mqttClientService) {
          scope.mqttClientService = value;
        },
      },
      scope,
    );

    it('converts units in Set Payload using stored variables and publishes the converted fields', async () => {
      (arithmeticTemplatesScope.variablesService.getAll as jest.Mock).mockResolvedValue({
        resource: { scale: 1000 },
        global: {},
      });
      const inputNode = arithmeticTemplatesScope.createNode({ id: 'arithmetic-trigger' });
      const setNode = arithmeticTemplatesScope.createNode({
        id: 'arithmetic-payload',
        type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
        data: {
          entries: [
            { key: 'converted.energy_kwh', value: '{{divide payload.energy_wh variables.resource.scale}}' },
            { key: 'converted.fahrenheit', value: '{{add (divide (multiply payload.celsius 9) 5) 32}}' },
          ],
        },
      });
      const mqttNode = arithmeticTemplatesScope.createNode({
        id: 'arithmetic-mqtt',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 42, topic: 'devices/converted', payload: '{{json converted}}' },
      });
      arithmeticTemplatesScope.initialNodes = [inputNode];
      arithmeticTemplatesScope.nodesById = {
        [inputNode.id]: inputNode,
        [setNode.id]: setNode,
        [mqttNode.id]: mqttNode,
      };
      arithmeticTemplatesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [
        { source: inputNode.id, target: setNode.id },
      ];
      arithmeticTemplatesScope.edgesBySourceAndHandle[`${setNode.id}|`] = [{ source: setNode.id, target: mqttNode.id }];

      await arithmeticTemplatesScope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {
        payload: { energy_wh: '1500', celsius: 20 },
      });

      expect(arithmeticTemplatesScope.mqttClientService.publish).toHaveBeenCalledWith(
        42,
        'devices/converted',
        '{"energy_kwh":"1.5","fahrenheit":"68"}',
        { qos: undefined, retain: undefined },
      );
    });

    it('stores the result of an arithmetic template as a numeric variable', async () => {
      const inputNode = arithmeticTemplatesScope.createNode({ id: 'arithmetic-trigger' });
      const setNode = arithmeticTemplatesScope.createNode({
        id: 'arithmetic-variable',
        type: ResourceFlowNodeType.PROCESSING_SET_VARIABLES,
        data: {
          variables: [{ key: 'energy_kwh', value: '{{divide payload.energy_wh 1000}}', scope: 'resource' }],
        },
      });
      arithmeticTemplatesScope.initialNodes = [inputNode];
      arithmeticTemplatesScope.nodesById = { [inputNode.id]: inputNode, [setNode.id]: setNode };
      arithmeticTemplatesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [
        { source: inputNode.id, target: setNode.id },
      ];

      await arithmeticTemplatesScope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {
        payload: { energy_wh: 1500 },
      });

      expect(arithmeticTemplatesScope.variablesService.set).toHaveBeenCalledWith('resource', 1, 'energy_kwh', 1.5, 1);
    });

    it.each([0, undefined, 'not-a-number'])('stops a node with invalid arithmetic input %p', async (divisor) => {
      const inputNode = arithmeticTemplatesScope.createNode({ id: 'arithmetic-trigger' });
      const setNode = arithmeticTemplatesScope.createNode({
        id: 'arithmetic-payload',
        type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
        data: { entries: [{ key: 'converted', value: '{{divide payload.value payload.divisor}}' }] },
      });
      const mqttNode = arithmeticTemplatesScope.createNode({
        id: 'arithmetic-mqtt',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 42, topic: 'devices/converted', payload: '{{converted}}' },
      });
      arithmeticTemplatesScope.initialNodes = [inputNode];
      arithmeticTemplatesScope.nodesById = {
        [inputNode.id]: inputNode,
        [setNode.id]: setNode,
        [mqttNode.id]: mqttNode,
      };
      arithmeticTemplatesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [
        { source: inputNode.id, target: setNode.id },
      ];
      arithmeticTemplatesScope.edgesBySourceAndHandle[`${setNode.id}|`] = [{ source: setNode.id, target: mqttNode.id }];

      await expect(
        arithmeticTemplatesScope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {
          payload: { value: 1500, divisor },
        }),
      ).rejects.toThrow('Template helper "divide"');
      expect(arithmeticTemplatesScope.mqttClientService.publish).not.toHaveBeenCalled();
    });
  });

  describe('variable nodes', () => {
    const variableNodesScope = inheritTestScope(
      {
        get createNode() {
          return scope.createNode;
        },
        get nodesById() {
          return scope.nodesById;
        },
        set nodesById(value: typeof scope.nodesById) {
          scope.nodesById = value;
        },
        get initialNodes() {
          return scope.initialNodes;
        },
        set initialNodes(value: typeof scope.initialNodes) {
          scope.initialNodes = value;
        },
        get edgesBySourceAndHandle() {
          return scope.edgesBySourceAndHandle;
        },
        set edgesBySourceAndHandle(value: typeof scope.edgesBySourceAndHandle) {
          scope.edgesBySourceAndHandle = value;
        },
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get variablesService() {
          return scope.variablesService;
        },
        set variablesService(value: typeof scope.variablesService) {
          scope.variablesService = value;
        },
        get mqttClientService() {
          return scope.mqttClientService;
        },
        set mqttClientService(value: typeof scope.mqttClientService) {
          scope.mqttClientService = value;
        },
      },
      scope,
    );

    it('PROCESSING_SET_VARIABLES renders templates and stores JSON-parsed values', async () => {
      const setNode = variableNodesScope.createNode({
        id: 'set-1',
        type: ResourceFlowNodeType.PROCESSING_SET_VARIABLES,
        resourceId: 1,
        data: {
          variables: [
            { key: 'count', value: '{{payload.n}}', scope: 'global' },
            { key: 'note', value: 'hello {{payload.who}}', scope: 'resource' },
          ],
        },
      });
      const inputNode = variableNodesScope.createNode({
        id: 'trigger-1',
        type: ResourceFlowNodeType.INPUT_BUTTON,
        resourceId: 1,
      });
      variableNodesScope.nodesById[inputNode.id] = inputNode;
      variableNodesScope.nodesById[setNode.id] = setNode;
      variableNodesScope.initialNodes = [inputNode];
      variableNodesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
      variableNodesScope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

      await variableNodesScope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {
        payload: { n: 5, who: 'world' },
      });

      expect(variableNodesScope.variablesService.set).toHaveBeenCalledTimes(2);
      expect(variableNodesScope.variablesService.set).toHaveBeenNthCalledWith(1, 'global', null, 'count', 5, 1);
      expect(variableNodesScope.variablesService.set).toHaveBeenNthCalledWith(
        2,
        'resource',
        1,
        'note',
        'hello world',
        1,
      );
    });

    it('serializes an object payload for a downstream MQTT message using {{json payload}}', async () => {
      const inputNode = variableNodesScope.createNode({
        id: 'trigger-1',
        type: ResourceFlowNodeType.INPUT_BUTTON,
        resourceId: 1,
      });
      const mqttNode = variableNodesScope.createNode({
        id: 'mqtt-1',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        resourceId: 1,
        data: { serverId: 42, topic: 'devices/update', payload: '{{json payload}}', qos: 1, retain: false },
      });
      variableNodesScope.nodesById[inputNode.id] = inputNode;
      variableNodesScope.nodesById[mqttNode.id] = mqttNode;
      variableNodesScope.initialNodes = [inputNode];
      variableNodesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
      variableNodesScope.edgesBySourceAndHandle[`${mqttNode.id}|`] = [];

      await variableNodesScope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, { payload: { enabled: true } });

      expect(variableNodesScope.mqttClientService.publish).toHaveBeenCalledWith(
        42,
        'devices/update',
        '{"enabled":true}',
        {
          qos: 1,
          retain: false,
        },
      );
    });

    it('PROCESSING_GET_VARIABLES writes lodash-set into payload', async () => {
      (variableNodesScope.variablesService.get as jest.Mock).mockImplementation(async (_scope, _rid, key) =>
        key === 'sessionId' ? 99 : undefined,
      );

      const inputNode = variableNodesScope.createNode({
        id: 't',
        type: ResourceFlowNodeType.INPUT_BUTTON,
        resourceId: 1,
      });
      const getNode = variableNodesScope.createNode({
        id: 'get-1',
        type: ResourceFlowNodeType.PROCESSING_GET_VARIABLES,
        resourceId: 1,
        data: {
          variables: [{ key: 'sessionId', scope: 'resource', payloadPath: 'session.id' }],
        },
      });
      variableNodesScope.nodesById[inputNode.id] = inputNode;
      variableNodesScope.nodesById[getNode.id] = getNode;
      variableNodesScope.initialNodes = [inputNode];
      variableNodesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: getNode.id }];
      variableNodesScope.edgesBySourceAndHandle[`${getNode.id}|`] = [];

      const result = await variableNodesScope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

      expect(result[0]).toMatchObject({ session: { id: 99 } });
      expect(variableNodesScope.variablesService.get).toHaveBeenCalledWith('resource', 1, 'sessionId');
    });

    it('exposes variables to Handlebars context via {{variables.resource.*}} and {{variables.global.*}}', async () => {
      (variableNodesScope.variablesService.getAll as jest.Mock).mockResolvedValue({
        resource: { foo: 1 },
        global: { bar: 'x' },
      });

      const inputNode = variableNodesScope.createNode({
        id: 't',
        type: ResourceFlowNodeType.INPUT_BUTTON,
        resourceId: 1,
      });
      const setNode = variableNodesScope.createNode({
        id: 'set-1',
        type: ResourceFlowNodeType.PROCESSING_SET_VARIABLES,
        resourceId: 1,
        data: {
          variables: [
            { key: 'rendered', value: '{{variables.resource.foo}}-{{variables.global.bar}}', scope: 'resource' },
          ],
        },
      });
      variableNodesScope.nodesById[inputNode.id] = inputNode;
      variableNodesScope.nodesById[setNode.id] = setNode;
      variableNodesScope.initialNodes = [inputNode];
      variableNodesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
      variableNodesScope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

      await variableNodesScope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {});

      expect(variableNodesScope.variablesService.set).toHaveBeenCalledWith('resource', 1, 'rendered', '1-x', 1);
    });
  });
});
