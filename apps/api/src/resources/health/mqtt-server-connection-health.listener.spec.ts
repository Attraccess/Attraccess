import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import {
  MqttServer,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceHealthSource,
  ResourceHealthState,
  ResourceHealthStatus,
} from '@attraccess/database-entities';
import { MqttServerConnectionHealthListener } from './mqtt-server-connection-health.listener';
import { ResourceHealthService } from './resource-health.service';
import { MqttClientService, MqttServerConnectionStatus } from '../../mqtt/mqtt-client.service';
import { MqttServerConnectionChangedEvent } from '../../mqtt/mqtt-connection.event';
import { MqttServerDeletedEvent } from '../../mqtt/mqtt-server-deleted.event';

const makeNode = (overrides: Partial<ResourceFlowNode>): ResourceFlowNode =>
  ({
    id: 'node-id',
    type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
    data: {},
    resourceId: 1,
    ...overrides,
  }) as ResourceFlowNode;

const makeEntry = (overrides: Partial<ResourceHealthState>): ResourceHealthState =>
  ({
    id: 1,
    resourceId: 1,
    identifier: 'mqtt-server-5',
    status: ResourceHealthStatus.UNHEALTHY,
    reason: null,
    source: ResourceHealthSource.SYSTEM,
    ...overrides,
  }) as ResourceHealthState;

describe('MqttServerConnectionHealthListener', () => {
  let listener: MqttServerConnectionHealthListener;

  let flowNodes: ResourceFlowNode[];
  let healthEntries: ResourceHealthState[];

  const flowNodeRepo = {
    find: jest.fn(),
  };
  const healthRepo = {
    find: jest.fn(),
  };
  const mqttServerRepo = {
    findOneBy: jest.fn(),
  };
  const resourceHealthService = {
    reportHealth: jest.fn(async () => undefined),
    clearEntry: jest.fn(async () => undefined),
  };
  const mqttClientService = {
    getConnectionState: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    flowNodes = [];
    healthEntries = [];

    flowNodeRepo.find.mockImplementation(async ({ where }: { where: { resourceId?: number } }) =>
      flowNodes.filter((node) => where.resourceId === undefined || node.resourceId === where.resourceId),
    );
    healthRepo.find.mockImplementation(
      async ({ where }: { where: { resourceId?: number; identifier?: string; status?: ResourceHealthStatus } }) =>
        healthEntries.filter((entry) => {
          if (where.resourceId !== undefined && entry.resourceId !== where.resourceId) return false;
          if (where.identifier !== undefined && entry.identifier !== where.identifier) return false;
          if (where.status !== undefined && entry.status !== where.status) return false;
          return true;
        }),
    );
    mqttServerRepo.findOneBy.mockImplementation(async ({ id }: { id: number }) =>
      id === 404 ? null : ({ id, name: `Server ${id}` } as MqttServer),
    );
    mqttClientService.getConnectionState.mockReturnValue({
      status: MqttServerConnectionStatus.UNKNOWN,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastError: null,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MqttServerConnectionHealthListener,
        { provide: getRepositoryToken(ResourceFlowNode), useValue: flowNodeRepo },
        { provide: getRepositoryToken(ResourceHealthState), useValue: healthRepo },
        { provide: getRepositoryToken(MqttServer), useValue: mqttServerRepo },
        { provide: ResourceHealthService, useValue: resourceHealthService },
        { provide: MqttClientService, useValue: mqttClientService },
      ],
    }).compile();

    listener = module.get(MqttServerConnectionHealthListener);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'error').mockImplementation(jest.fn());
  });

  describe('onConnectionChanged (disconnected)', () => {
    it('marks all resources using the server in any flow node unhealthy', async () => {
      flowNodes = [
        makeNode({ id: 'a', resourceId: 1, type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, data: { serverId: 5 } }),
        makeNode({
          id: 'b',
          resourceId: 2,
          type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED,
          data: { serverId: 5, topic: 't' },
        }),
        makeNode({
          id: 'c',
          resourceId: 2,
          type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
          data: { serverId: 5, topic: 't' },
        }),
        makeNode({ id: 'd', resourceId: 3, type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, data: { serverId: 9 } }),
      ];

      await listener.onConnectionChanged(new MqttServerConnectionChangedEvent(5, false, 'ECONNREFUSED'));

      expect(resourceHealthService.reportHealth).toHaveBeenCalledTimes(2);
      expect(resourceHealthService.reportHealth).toHaveBeenCalledWith({
        resourceId: 1,
        identifier: 'mqtt-server-5',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'MQTT server "Server 5" is disconnected: ECONNREFUSED',
        source: ResourceHealthSource.SYSTEM,
      });
      expect(resourceHealthService.reportHealth).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: 2, identifier: 'mqtt-server-5', status: ResourceHealthStatus.UNHEALTHY }),
      );
    });

    it('does nothing when no resource uses the server', async () => {
      flowNodes = [
        makeNode({ id: 'a', resourceId: 1, type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, data: { serverId: 9 } }),
      ];

      await listener.onConnectionChanged(new MqttServerConnectionChangedEvent(5, false));

      expect(resourceHealthService.reportHealth).not.toHaveBeenCalled();
    });
  });

  describe('onConnectionChanged (connected)', () => {
    it('flips existing unhealthy entries back to healthy', async () => {
      healthEntries = [
        makeEntry({ id: 10, resourceId: 1, identifier: 'mqtt-server-5' }),
        makeEntry({ id: 11, resourceId: 2, identifier: 'mqtt-server-5' }),
      ];

      await listener.onConnectionChanged(new MqttServerConnectionChangedEvent(5, true));

      expect(resourceHealthService.reportHealth).toHaveBeenCalledTimes(2);
      expect(resourceHealthService.reportHealth).toHaveBeenCalledWith({
        resourceId: 1,
        identifier: 'mqtt-server-5',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.SYSTEM,
      });
    });

    it('does not create healthy entries for resources without an existing entry', async () => {
      healthEntries = [];

      await listener.onConnectionChanged(new MqttServerConnectionChangedEvent(5, true));

      expect(resourceHealthService.reportHealth).not.toHaveBeenCalled();
    });
  });

  describe('onServerDeleted', () => {
    it('clears all health entries tied to the deleted server', async () => {
      healthEntries = [
        makeEntry({ id: 10, resourceId: 1, identifier: 'mqtt-server-5' }),
        makeEntry({ id: 11, resourceId: 2, identifier: 'mqtt-server-5' }),
      ];

      await listener.onServerDeleted(new MqttServerDeletedEvent(5));

      expect(resourceHealthService.clearEntry).toHaveBeenCalledTimes(2);
      expect(resourceHealthService.clearEntry).toHaveBeenCalledWith(1, 10);
      expect(resourceHealthService.clearEntry).toHaveBeenCalledWith(2, 11);
    });
  });

  describe('onResourceFlowChanged / reconcileResource', () => {
    it('accepts the raw resourceId payload emitted by the flow save', async () => {
      flowNodes = [];
      healthEntries = [];

      await listener.onResourceFlowChanged(42);

      expect(flowNodeRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ resourceId: 42 }) }));
    });

    it('clears entries for servers the flow no longer references', async () => {
      flowNodes = [
        makeNode({ id: 'a', resourceId: 1, type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, data: { serverId: 9 } }),
      ];
      healthEntries = [
        makeEntry({ id: 10, resourceId: 1, identifier: 'mqtt-server-5' }),
        makeEntry({ id: 11, resourceId: 1, identifier: 'other-identifier' }),
      ];

      await listener.reconcileResource(1);

      expect(resourceHealthService.clearEntry).toHaveBeenCalledTimes(1);
      expect(resourceHealthService.clearEntry).toHaveBeenCalledWith(1, 10);
    });

    it('marks the resource unhealthy when a referenced server is disconnected', async () => {
      flowNodes = [
        makeNode({ id: 'a', resourceId: 1, type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, data: { serverId: 5 } }),
      ];
      mqttClientService.getConnectionState.mockReturnValue({
        status: MqttServerConnectionStatus.DISCONNECTED,
        lastConnectedAt: null,
        lastDisconnectedAt: new Date(),
        lastError: 'broker gone',
      });

      await listener.reconcileResource(1);

      expect(resourceHealthService.reportHealth).toHaveBeenCalledWith({
        resourceId: 1,
        identifier: 'mqtt-server-5',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'MQTT server "Server 5" is disconnected: broker gone',
        source: ResourceHealthSource.SYSTEM,
      });
    });

    it('marks an existing entry healthy when the referenced server is connected', async () => {
      flowNodes = [
        makeNode({ id: 'a', resourceId: 1, type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, data: { serverId: 5 } }),
      ];
      healthEntries = [makeEntry({ id: 10, resourceId: 1, identifier: 'mqtt-server-5' })];
      mqttClientService.getConnectionState.mockReturnValue({
        status: MqttServerConnectionStatus.CONNECTED,
        lastConnectedAt: new Date(),
        lastDisconnectedAt: null,
        lastError: null,
      });

      await listener.reconcileResource(1);

      expect(resourceHealthService.reportHealth).toHaveBeenCalledWith({
        resourceId: 1,
        identifier: 'mqtt-server-5',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.SYSTEM,
      });
    });

    it('does not create an entry when the referenced server is connected and no entry exists', async () => {
      flowNodes = [
        makeNode({ id: 'a', resourceId: 1, type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, data: { serverId: 5 } }),
      ];
      healthEntries = [];
      mqttClientService.getConnectionState.mockReturnValue({
        status: MqttServerConnectionStatus.CONNECTED,
        lastConnectedAt: new Date(),
        lastDisconnectedAt: null,
        lastError: null,
      });

      await listener.reconcileResource(1);

      expect(resourceHealthService.reportHealth).not.toHaveBeenCalled();
    });

    it('leaves entries untouched while the referenced server is still connecting', async () => {
      flowNodes = [
        makeNode({ id: 'a', resourceId: 1, type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE, data: { serverId: 5 } }),
      ];
      healthEntries = [makeEntry({ id: 10, resourceId: 1, identifier: 'mqtt-server-5' })];
      mqttClientService.getConnectionState.mockReturnValue({
        status: MqttServerConnectionStatus.CONNECTING,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        lastError: null,
      });

      await listener.reconcileResource(1);

      expect(resourceHealthService.reportHealth).not.toHaveBeenCalled();
      expect(resourceHealthService.clearEntry).not.toHaveBeenCalled();
    });
  });
});
