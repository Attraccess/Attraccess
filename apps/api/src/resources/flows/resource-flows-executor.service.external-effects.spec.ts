import {
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceType,
} from '@attraccess/database-entities';

import { EventEmitter2 } from '@nestjs/event-emitter';

import axios from 'axios';

import { Repository, SelectQueryBuilder } from 'typeorm';

import { MqttClientService } from './../../mqtt/mqtt-client.service';

import { inheritTestScope } from './../../test-utils/inherit-test-scope';

import { ResourceHealthService } from './../health/resource-health.service';

import { ResourceUsageService } from './../usage/resourceUsage.service';

import { FlowLogRecorderService } from './flow-log-recorder.service';

import { ResourceFlowVariablesService } from './resource-flow-variables.service';

import { ResourceFlowsExecutorService } from './resource-flows-executor.service';

import { resetTestFixture } from './resource-flows-executor.service.setup.test-fixture';

import { createNode } from './resource-flows-executor.service.spec.create-node';

import { Edge } from './resource-flows-executor.service.spec.edge';

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

  it.each(['trigger nodes', 'outgoing edges'])(
    'waits for started sibling %s before rejecting a flow',
    async (fanout) => {
      const input = scope.createNode({ id: 'input', type: ResourceFlowNodeType.INPUT_BUTTON });
      const siblingInput = scope.createNode({ id: 'sibling-input', type: ResourceFlowNodeType.INPUT_BUTTON });
      const failing = scope.createNode({
        id: 'failing',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 1, topic: 'failing', failureBehavior: 'fail-flow' },
      });
      const sibling = scope.createNode({
        id: 'sibling',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 1, topic: 'sibling', failureBehavior: 'fail-flow' },
      });
      [input, siblingInput, failing, sibling].forEach((node) => {
        scope.nodesById[node.id] = node;
      });
      scope.initialNodes = fanout === 'trigger nodes' ? [input, siblingInput] : [input];
      scope.edgesBySourceAndHandle =
        fanout === 'trigger nodes'
          ? {
              'input|': [{ source: input.id, target: failing.id }],
              'sibling-input|': [{ source: siblingInput.id, target: sibling.id }],
            }
          : {
              'input|': [
                { source: input.id, target: failing.id },
                { source: input.id, target: sibling.id },
              ],
            };
      let releaseSibling: () => void;
      let markSiblingStarted: () => void;
      const siblingStarted = new Promise<void>((resolve) => {
        markSiblingStarted = resolve;
      });
      const siblingCompletion = new Promise<void>((resolve) => {
        releaseSibling = resolve;
      });
      scope.mqttClientService.publish = jest.fn(async (_serverId, topic) => {
        if (topic === 'failing') throw new Error('First branch failed');
        markSiblingStarted();
        await siblingCompletion;
      });
      const rejected = jest.fn();
      scope.flowLogs.start(1);
      const completion = scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {}).catch((error) => {
        rejected(error);
        return error;
      });
      await siblingStarted;
      await new Promise<void>((resolve) => setImmediate(resolve));

      try {
        expect(rejected).not.toHaveBeenCalled();
        expect(scope.flowLogs.getLogs(1).logs.some((log) => log.type === 'flow.completed')).toBe(false);
      } finally {
        releaseSibling();
      }

      expect(await completion).toMatchObject({ message: 'First branch failed' });
      expect(rejected).toHaveBeenCalledTimes(1);
      expect(scope.mqttClientService.publish).toHaveBeenCalledTimes(2);
      expect(scope.flowLogs.getLogs(1).logs.some((log) => log.type === 'flow.completed')).toBe(true);
    },
  );

  it.each([
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER,
  ])('preserves no-policy external-effect failures for the %s lifecycle flow', async (triggerNodeType) => {
    const inputNode = scope.createNode({ id: 'in-1', type: triggerNodeType });
    scope.initialNodes = [inputNode];

    const expectLegacyFailure = async (
      node: ResourceFlowNode,
      setup: () => void,
      message: string | RegExp,
    ): Promise<void> => {
      scope.nodesById = { [inputNode.id]: inputNode, [node.id]: node };
      scope.edgesBySourceAndHandle = {
        [`${inputNode.id}|`]: [{ source: inputNode.id, target: node.id }],
        [`${node.id}|`]: [],
      };
      setup();

      await expect(scope.service.runFlow(1, triggerNodeType, {})).rejects.toThrow(message);
    };

    await expectLegacyFailure(
      scope.createNode({
        id: 'http-1',
        type: ResourceFlowNodeType.OUTPUT_HTTP_SEND_REQUEST,
        data: { url: 'https://example.com', method: 'POST' },
      }),
      () => (axios.request as jest.Mock).mockRejectedValueOnce(new Error('HTTP unavailable')),
      'HTTP unavailable',
    );
    await expectLegacyFailure(
      scope.createNode({
        id: 'mqtt-1',
        type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
        data: { serverId: 1, topic: 'devices/state' },
      }),
      () => (scope.mqttClientService.publish as jest.Mock).mockRejectedValueOnce(new Error('MQTT unavailable')),
      'MQTT unavailable',
    );
    await expectLegacyFailure(
      scope.createNode({ id: 'end-1', type: ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION, data: {} }),
      () => (scope.resourceUsageService.getActiveSession as jest.Mock).mockResolvedValueOnce(null),
      'NO_USAGE_SESSION',
    );
    await expectLegacyFailure(
      scope.createNode({
        id: 'wait-1',
        type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
        data: { serverId: 1, topic: 'devices/state', timeoutSeconds: 1 },
      }),
      () => undefined,
      /Timeout waiting for MQTT message/,
    );
  });

  it('propagates an external-effect failure when configured to fail the flow', async () => {
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_BUTTON });
    const mqttNode = scope.createNode({
      id: 'mqtt-1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      data: { serverId: 1, topic: 'devices/state', failureBehavior: 'fail-flow' },
    });
    [inputNode, mqttNode].forEach((node) => (scope.nodesById[node.id] = node));
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: mqttNode.id }];
    scope.mqttClientService.publish = jest.fn().mockRejectedValue(new Error('Broker unavailable'));

    await expect(scope.service.runFlow(1, ResourceFlowNodeType.INPUT_BUTTON, {})).rejects.toMatchObject({
      message: 'Broker unavailable',
      failureKind: 'transport-dispatch',
      status: 503,
    });
  });

  it('ends the active usage session with templated notes and passes payload through', async () => {
    // Arrange nodes: INPUT -> END_SESSION (terminal)
    const inputNode = scope.createNode({ id: 'in-1', type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED });
    const endNode = scope.createNode({
      id: 'end-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION,
      data: { notes: 'Ended by {{user.username}}' },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[endNode.id] = endNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: endNode.id }];
    scope.edgesBySourceAndHandle[`${endNode.id}|`] = [];

    // Mock active session and endSession
    (scope.resourceUsageService.getActiveSession as jest.Mock).mockResolvedValue({
      id: 'ru-1',
      user: { id: 42, username: 'alice' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (scope.resourceUsageService as any).endSession = jest.fn().mockResolvedValue(undefined);

    const initialData = { user: { username: 'bob' } };

    // Act
    const result = await scope.service.runFlow(1, ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED, initialData);

    // Assert leaf payload passthrough
    expect(result).toEqual([
      {
        ...initialData,
        resource: { id: 1, name: 'Resource 1', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);

    // Assert endSession called with compiled notes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((scope.resourceUsageService as any).endSession).toHaveBeenCalledWith(
      1,
      { id: 42, username: 'alice' },
      {
        notes: 'Ended by bob',
      },
      { skipFormSubmissions: true, skipNoteNotification: true, auditOrigin: { actorId: null } },
    );
  });

  it.each([
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
    ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER,
  ])('propagates explicit termination failures from the %s lifecycle flow', async (triggerNodeType) => {
    const inputNode = scope.createNode({ id: 'in-1', type: triggerNodeType });
    const endNode = scope.createNode({
      id: 'end-1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION,
      data: { failureBehavior: 'fail-flow' },
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[endNode.id] = endNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: endNode.id }];
    scope.edgesBySourceAndHandle[`${endNode.id}|`] = [];

    (scope.resourceUsageService.getActiveSession as jest.Mock).mockResolvedValue(null);

    await expect(scope.service.runFlow(1, triggerNodeType, {})).rejects.toMatchObject({
      message: 'NO_USAGE_SESSION',
      failureKind: 'node-failure',
      status: 503,
    });
  });

  it('updates resource activity when track-activity node executes and passes payload through', async () => {
    const resourceId = 5;
    const inputNode = scope.createNode({ id: 'in-activity', type: ResourceFlowNodeType.INPUT_BUTTON, resourceId });
    const trackNode = scope.createNode({
      id: 'track-activity',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_ACTIVITY_TRACK_ACTIVITY,
      resourceId,
    });
    scope.nodesById[inputNode.id] = inputNode;
    scope.nodesById[trackNode.id] = trackNode;
    scope.initialNodes = [inputNode];
    scope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: trackNode.id }];
    scope.edgesBySourceAndHandle[`${trackNode.id}|`] = [];

    const payload = { foo: 'bar' };

    const resourceActivity = (scope.service as unknown as { resourceActivity: Map<number, Date> }).resourceActivity;

    expect(resourceActivity.get(resourceId)).toBeUndefined();

    const result = await scope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, payload);

    expect(result).toEqual([
      {
        ...payload,
        resource: { id: 5, name: 'Resource 5', type: ResourceType.Machine, metadata: { zone: 'A' } },
      },
    ]);
    const lastActivity = resourceActivity.get(resourceId);
    expect(lastActivity).toBeInstanceOf(Date);
  });

  it('triggers inactivity flow when resource exceeds configured inactivity minutes', async () => {
    const resourceId = 9;
    const inactivityNode = scope.createNode({
      id: 'inactive-1',
      type: ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY,
      resourceId,
      data: { minInactivityMinutes: 5 },
    });

    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([inactivityNode]),
    } as unknown as SelectQueryBuilder<ResourceFlowNode>;
    const flowNodeRepoWithQueryBuilder = scope.flowNodeRepository as { createQueryBuilder: jest.Mock };
    flowNodeRepoWithQueryBuilder.createQueryBuilder = jest.fn(() => qb);

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const resourceActivity = (scope.service as unknown as { resourceActivity: Map<number, Date> }).resourceActivity;
    resourceActivity.set(resourceId, tenMinutesAgo);

    const serviceWithStartFlow = scope.service as unknown as { startFlow: jest.Mock };
    const startFlowSpy = jest.spyOn(serviceWithStartFlow, 'startFlow').mockResolvedValue([]);

    await scope.service.checkResourceActivity();

    expect(startFlowSpy).toHaveBeenCalledWith(inactivityNode, { payload: {} });
    const updatedActivity = resourceActivity.get(resourceId) as Date;
    expect(updatedActivity).toBeInstanceOf(Date);
    expect(updatedActivity.getTime()).toBeGreaterThan(tenMinutesAgo.getTime());
  });

  describe('health nodes', () => {
    const healthNodesScope = inheritTestScope(
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
        get resourceHealthService() {
          return scope.resourceHealthService;
        },
        set resourceHealthService(value: typeof scope.resourceHealthService) {
          scope.resourceHealthService = value;
        },
        get flowNodeRepository() {
          return scope.flowNodeRepository;
        },
        set flowNodeRepository(value: typeof scope.flowNodeRepository) {
          scope.flowNodeRepository = value;
        },
      },
      scope,
    );

    it('reports healthy when heartbeat output node fires and stores last seen timestamp', async () => {
      const resourceId = 11;
      const inputNode = healthNodesScope.createNode({
        id: 'in-hb',
        type: ResourceFlowNodeType.INPUT_BUTTON,
        resourceId,
      });
      const heartbeatNode = healthNodesScope.createNode({
        id: 'heartbeat-1',
        type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
        resourceId,
        data: { identifier: 'ir-bridge', timeoutSeconds: 60, unhealthyReason: 'no signal' },
      });
      healthNodesScope.nodesById[inputNode.id] = inputNode;
      healthNodesScope.nodesById[heartbeatNode.id] = heartbeatNode;
      healthNodesScope.initialNodes = [inputNode];
      healthNodesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [
        { source: inputNode.id, target: heartbeatNode.id },
      ];
      healthNodesScope.edgesBySourceAndHandle[`${heartbeatNode.id}|`] = [];

      await healthNodesScope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {});

      expect(healthNodesScope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId,
          identifier: 'ir-bridge',
          status: 'healthy',
          source: 'heartbeat',
        }),
      );

      const lastSeen = healthNodesScope.service.getHeartbeatLastSeen(resourceId, 'ir-bridge');
      expect(lastSeen).toBeInstanceOf(Date);
    });

    it('SET node sets unhealthy from static config with templated reason', async () => {
      const resourceId = 12;
      const inputNode = healthNodesScope.createNode({
        id: 'in-set-1',
        type: ResourceFlowNodeType.INPUT_BUTTON,
        resourceId,
      });
      const setNode = healthNodesScope.createNode({
        id: 'set-1',
        type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
        resourceId,
        data: { identifier: 'Internal', status: 'unhealthy', reason: 'temp={{temp}}' },
      });
      healthNodesScope.nodesById[inputNode.id] = inputNode;
      healthNodesScope.nodesById[setNode.id] = setNode;
      healthNodesScope.initialNodes = [inputNode];
      healthNodesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
      healthNodesScope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

      await healthNodesScope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, { temp: 91 });

      expect(healthNodesScope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId,
          identifier: 'Internal',
          status: 'unhealthy',
          reason: 'temp=91',
          source: 'manual',
        }),
      );
    });

    it('SET node sets healthy from static config and clears reason', async () => {
      const resourceId = 13;
      const inputNode = healthNodesScope.createNode({
        id: 'in-set-h',
        type: ResourceFlowNodeType.INPUT_BUTTON,
        resourceId,
      });
      const setNode = healthNodesScope.createNode({
        id: 'set-h',
        type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
        resourceId,
        data: { identifier: '', status: 'healthy', reason: '' },
      });
      healthNodesScope.nodesById[inputNode.id] = inputNode;
      healthNodesScope.nodesById[setNode.id] = setNode;
      healthNodesScope.initialNodes = [inputNode];
      healthNodesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
      healthNodesScope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

      await healthNodesScope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {});

      expect(healthNodesScope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId,
          identifier: '',
          status: 'healthy',
          reason: null,
          source: 'manual',
        }),
      );
    });

    it('SET node payload health.status overrides static status and switches source to payload', async () => {
      const resourceId = 14;
      const inputNode = healthNodesScope.createNode({
        id: 'in-set-ovs',
        type: ResourceFlowNodeType.INPUT_BUTTON,
        resourceId,
      });
      const setNode = healthNodesScope.createNode({
        id: 'set-ovs',
        type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
        resourceId,
        data: { identifier: 'ir-bridge', status: 'healthy', reason: 'fallback' },
      });
      healthNodesScope.nodesById[inputNode.id] = inputNode;
      healthNodesScope.nodesById[setNode.id] = setNode;
      healthNodesScope.initialNodes = [inputNode];
      healthNodesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
      healthNodesScope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

      await healthNodesScope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {
        health: { status: 'unhealthy', reason: 'lost wifi' },
      });

      expect(healthNodesScope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId,
          identifier: 'ir-bridge',
          status: 'unhealthy',
          reason: 'lost wifi',
          source: 'payload',
        }),
      );
    });

    it('SET node payload health.identifier overrides static identifier', async () => {
      const resourceId = 15;
      const inputNode = healthNodesScope.createNode({
        id: 'in-set-id',
        type: ResourceFlowNodeType.INPUT_BUTTON,
        resourceId,
      });
      const setNode = healthNodesScope.createNode({
        id: 'set-id',
        type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
        resourceId,
        data: { identifier: 'StaticId', status: 'unhealthy', reason: 'static reason' },
      });
      healthNodesScope.nodesById[inputNode.id] = inputNode;
      healthNodesScope.nodesById[setNode.id] = setNode;
      healthNodesScope.initialNodes = [inputNode];
      healthNodesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
      healthNodesScope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

      await healthNodesScope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {
        health: { identifier: 'PayloadId' },
      });

      expect(healthNodesScope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: 'PayloadId',
          status: 'unhealthy',
        }),
      );
    });

    it('SET node uses static reason when payload reason absent', async () => {
      const resourceId = 16;
      const inputNode = healthNodesScope.createNode({
        id: 'in-set-sr',
        type: ResourceFlowNodeType.INPUT_BUTTON,
        resourceId,
      });
      const setNode = healthNodesScope.createNode({
        id: 'set-sr',
        type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
        resourceId,
        data: { identifier: '', status: 'unhealthy', reason: 'static fallback' },
      });
      healthNodesScope.nodesById[inputNode.id] = inputNode;
      healthNodesScope.nodesById[setNode.id] = setNode;
      healthNodesScope.initialNodes = [inputNode];
      healthNodesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
      healthNodesScope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

      await healthNodesScope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {});

      expect(healthNodesScope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
          reason: 'static fallback',
          source: 'manual',
        }),
      );
    });

    it('SET node throws on invalid payload status', async () => {
      const resourceId = 17;
      const inputNode = healthNodesScope.createNode({
        id: 'in-set-bad',
        type: ResourceFlowNodeType.INPUT_BUTTON,
        resourceId,
      });
      const setNode = healthNodesScope.createNode({
        id: 'set-bad',
        type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
        resourceId,
        data: { identifier: '', status: 'healthy', reason: '' },
      });
      healthNodesScope.nodesById[inputNode.id] = inputNode;
      healthNodesScope.nodesById[setNode.id] = setNode;
      healthNodesScope.initialNodes = [inputNode];
      healthNodesScope.edgesBySourceAndHandle[`${inputNode.id}|`] = [{ source: inputNode.id, target: setNode.id }];
      healthNodesScope.edgesBySourceAndHandle[`${setNode.id}|`] = [];

      await expect(
        healthNodesScope.service.runFlow(resourceId, ResourceFlowNodeType.INPUT_BUTTON, {
          health: { status: 'maybe' },
        }),
      ).rejects.toThrow(/expected "healthy" or "unhealthy"/);
    });

    it('triggers heartbeat unhealthy report when timeout elapsed', async () => {
      const resourceId = 18;
      const heartbeatNode = healthNodesScope.createNode({
        id: 'hb-timeout',
        type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
        resourceId,
        data: { identifier: 'ir-bridge', timeoutSeconds: 60, unhealthyReason: 'no signal' },
      });

      (healthNodesScope.flowNodeRepository.find as jest.Mock).mockResolvedValueOnce([heartbeatNode]);

      const heartbeatLastSeen = (healthNodesScope.service as unknown as { heartbeatLastSeen: Map<string, Date> })
        .heartbeatLastSeen;
      heartbeatLastSeen.set(`${resourceId}::ir-bridge`, new Date(Date.now() - 5 * 60 * 1000));

      await healthNodesScope.service.checkHealthHeartbeats();

      expect(healthNodesScope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId,
          identifier: 'ir-bridge',
          status: 'unhealthy',
          reason: 'no signal',
          source: 'heartbeat',
        }),
      );
    });

    it('does not trigger heartbeat unhealthy when within timeout', async () => {
      const resourceId = 19;
      const heartbeatNode = healthNodesScope.createNode({
        id: 'hb-fresh',
        type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
        resourceId,
        data: { identifier: '', timeoutSeconds: 60, unhealthyReason: '' },
      });

      (healthNodesScope.flowNodeRepository.find as jest.Mock).mockResolvedValueOnce([heartbeatNode]);

      const heartbeatLastSeen = (healthNodesScope.service as unknown as { heartbeatLastSeen: Map<string, Date> })
        .heartbeatLastSeen;
      heartbeatLastSeen.set(`${resourceId}::`, new Date(Date.now() - 10 * 1000));

      await healthNodesScope.service.checkHealthHeartbeats();

      expect(healthNodesScope.resourceHealthService.reportHealth).not.toHaveBeenCalled();
    });

    it('initialises last-seen on first heartbeat tick when not previously set', async () => {
      const resourceId = 20;
      const heartbeatNode = healthNodesScope.createNode({
        id: 'hb-firsttick',
        type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
        resourceId,
        data: { identifier: '', timeoutSeconds: 60, unhealthyReason: '' },
      });

      (healthNodesScope.flowNodeRepository.find as jest.Mock).mockResolvedValueOnce([heartbeatNode]);

      await healthNodesScope.service.checkHealthHeartbeats();

      expect(healthNodesScope.resourceHealthService.reportHealth).not.toHaveBeenCalled();
      expect(healthNodesScope.service.getHeartbeatLastSeen(resourceId, '')).toBeInstanceOf(Date);
    });

    it('uses default reason when unhealthyReason is blank on heartbeat timeout', async () => {
      const resourceId = 21;
      const heartbeatNode = healthNodesScope.createNode({
        id: 'hb-default-reason',
        type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
        resourceId,
        data: { identifier: '', timeoutSeconds: 30, unhealthyReason: '' },
      });

      (healthNodesScope.flowNodeRepository.find as jest.Mock).mockResolvedValueOnce([heartbeatNode]);

      const heartbeatLastSeen = (healthNodesScope.service as unknown as { heartbeatLastSeen: Map<string, Date> })
        .heartbeatLastSeen;
      heartbeatLastSeen.set(`${resourceId}::`, new Date(Date.now() - 5 * 60 * 1000));

      await healthNodesScope.service.checkHealthHeartbeats();

      expect(healthNodesScope.resourceHealthService.reportHealth).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Heartbeat timed out',
        }),
      );
    });
  });
});
