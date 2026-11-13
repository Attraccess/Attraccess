import {
  AuditLog,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceHealthState,
  ResourceType,
} from '@attraccess/database-entities';
import {
  AuthenticatedRequest,
  PLUGIN_AUDIT_HOST_PROVIDER,
  PluginContext,
  PluginPermission,
} from '@attraccess/plugins-backend-sdk';
import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { MqttMessageEvent } from '../mqtt/mqtt-message.event';
import { MqttServerController } from '../mqtt/servers/mqtt-server.controller';
import { MqttServerService } from '../mqtt/servers/mqtt-server.service';
import { registerPluginFlowNodes } from '../plugin-system/flows/node-registry';
import { LoadedPluginManifest } from '../plugin-system/plugin.manifest';
import { PluginModule } from '../plugin-system/plugin.module';
import { ResourceFlowsExecutorService } from '../resources/flows/execution/resource-flows-executor.service';
import { FlowLogRecorderService } from '../resources/flows/logs/flow-log-recorder.service';
import { ResourceHealthService } from '../resources/health/resource-health.service';
import { setupAuditDatabase } from './audit.test-fixture';
import { auditActorOf, AuditRecorder } from './recorder/audit-event';

/**
 * Changes that start outside an HTTP request — an MQTT message driving a flow, a plugin triggering a flow or calling
 * a core service through its PluginContext — go through the same owning service and record the same row. The flow
 * engine, its node executors, the plugin context and the audit storage are real; only repositories are in memory.
 */
describe('audit recorded through flows, MQTT and the plugin context', () => {
  const fixture = setupAuditDatabase();
  const pluginName = 'audit-paths-plugin';
  const pluginTrigger = `plugin.${pluginName}.signal`;

  beforeAll(() => {
    // The registry is process-wide and has no unregister; the node type is unique to this file.
    registerPluginFlowNodes(pluginName, [
      { type: pluginTrigger, label: 'Signal', configSchema: {}, inputs: [], outputs: ['output'], isInput: true },
    ]);
  });

  beforeEach(async () => {
    for (const level of ['debug', 'log', 'warn'] as const)
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    await fixture.store.setPlainSetting('audit', 'domains', JSON.stringify(['administration', 'resource']));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (PluginModule as unknown as { resetHostReferences(): void }).resetHostReferences();
  });

  /** Every stored column except the generated id, timestamp and operation id. */
  const rows = async () =>
    (await fixture.source.getRepository(AuditLog).find({ order: { id: 'ASC' } })).map(
      ({ id, at, operationId, ...row }) => (void id, void at, void operationId, row),
    );

  /** The row a flow-set health transition stores: a system change, no user. */
  const healthTransition = (resourceId: number, healthSource: string) => ({
    domain: 'resource',
    pluginId: 'core',
    action: 'health.transition',
    actorId: null,
    authenticationMethod: null,
    apiTokenId: null,
    outcome: 'succeeded',
    subjectType: 'resource',
    subjectId: resourceId,
    ipAddress: null,
    userAgent: null,
    details: { previousStatus: 'none', status: 'unhealthy', healthSource },
  });

  /** The real health service over an in-memory state table. */
  function healthService(audit: AuditRecorder): ResourceHealthService {
    const states: ResourceHealthState[] = [];
    return new ResourceHealthService(
      {
        findOne: async ({ where }: { where: Partial<ResourceHealthState> }) =>
          states.find((state) => state.resourceId === where.resourceId && state.identifier === where.identifier) ??
          null,
        create: (value: Partial<ResourceHealthState>) => ({ ...value }),
        save: async (value: ResourceHealthState) => {
          if (!states.includes(value)) states.push(Object.assign(value, { id: states.length + 1 }));
          return value;
        },
      } as never,
      {} as never,
      new EventEmitter2(),
      audit,
    );
  }

  /** The real flow executor (trigger dispatch, engine, node executors) over in-memory flow tables. */
  function flowExecutor(
    nodes: ResourceFlowNode[],
    edges: { source: string; target: string; sourceHandle?: string }[],
    health: ResourceHealthService,
  ): ResourceFlowsExecutorService {
    const ofType = (type: unknown) => nodes.filter((node) => node.type === type);
    const flowNodeRepository = {
      find: async ({ where }: { where: { type?: string } | { type?: string }[] }) =>
        (Array.isArray(where) ? where : [where])
          .flatMap(({ type }) => ofType(type))
          .filter((node, index, all) => all.indexOf(node) === index),
      findOne: async ({ where }: { where: { id: string } }) => nodes.find((node) => node.id === where.id) ?? null,
      // The plugin trigger page query: one page of nodes of the requested type.
      createQueryBuilder: () => {
        let type: unknown;
        const builder = {
          leftJoin: () => builder,
          where: (_sql: string, values: { type: string }) => ((type = values.type), builder),
          andWhere: () => builder,
          orderBy: () => builder,
          limit: () => builder,
          getMany: async () => ofType(type),
        };
        return builder;
      },
    };
    const flowEdgeRepository = {
      find: async ({ where }: { where: { source: string; sourceHandle?: string } }) =>
        edges.filter(
          (edge) => edge.source === where.source && (edge.sourceHandle ?? '') === (where.sourceHandle ?? ''),
        ),
    };
    return new ResourceFlowsExecutorService(
      flowNodeRepository as never,
      flowEdgeRepository as never,
      { findOne: async () => ({ id: 1, name: 'Lathe', type: ResourceType.Machine, metadata: {} }) } as never,
      new FlowLogRecorderService(),
      { publish: jest.fn(), subscribe: jest.fn() } as never,
      {} as never,
      {} as never,
      new EventEmitter2(),
      health,
      { getAll: async () => ({ resource: {}, global: {} }), getMany: async () => ({}) } as never,
      { time: (_name: string, run: () => unknown) => run() } as never,
      {
        timeFlow: (_t: string, run: () => unknown) => run(),
        timeNode: (_n: string, run: () => unknown) => run(),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  const node = (id: string, type: string, data: object): ResourceFlowNode =>
    ({ id, type, resourceId: 1, flowId: null, position: { x: 0, y: 0 }, data }) as unknown as ResourceFlowNode;

  const setHealth = node('set-health', ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET, {
    identifier: 'spindle',
    status: 'unhealthy',
    reason: 'Overheated',
  });

  it('mqtt: a broker message that triggers a flow records the health transition the flow sets', async () => {
    const executor = flowExecutor(
      [
        node('mqtt-in', ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED, { serverId: 5, topic: 'lathe/+/state' }),
        setHealth,
      ],
      [{ source: 'mqtt-in', target: 'set-health' }],
      healthService(fixture.service),
    );
    // How the MQTT client hands a received message to the flows (`@OnEvent(MqttMessageEvent.EVENT_NAME)`).
    const events = new EventEmitter2();
    events.on(MqttMessageEvent.EVENT_NAME, (event: MqttMessageEvent) => executor.handleMqttMessageReceivedEvent(event));

    // A message on another server or topic starts no flow.
    await events.emitAsync(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(6, 'lathe/spindle/state', 'overheated'));
    await events.emitAsync(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(5, 'mill/spindle/state', 'overheated'));
    expect(await rows()).toEqual([]);

    await events.emitAsync(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(5, 'lathe/spindle/state', 'overheated'));

    expect(await rows()).toEqual([healthTransition(1, 'manual')]);
  });

  describe('plugin context', () => {
    const req = { user: { id: 42, authenticationMethod: 'api-token', apiTokenId: 9 } } as AuthenticatedRequest;

    /** The context the host hands a loaded plugin, wired to these host services. */
    function pluginContext(permissions: PluginPermission[], providers: Map<unknown, unknown>): PluginContext {
      const moduleRef = { get: (token: unknown) => providers.get(token) } as unknown as ModuleRef;
      new PluginModule({} as DataSource, new EventEmitter2(), moduleRef);
      return (
        PluginModule as unknown as { createPluginContext(manifest: LoadedPluginManifest): PluginContext }
      ).createPluginContext({
        id: fixture.fixturePluginId,
        name: pluginName,
        version: '1.0.0',
        pluginDirectory: pluginName,
        permissions,
        main: { backend: { directory: `${pluginName}/dist`, entryPoint: 'index.js' } },
        attraccessVersion: { min: '1.0.0' },
      } as LoadedPluginManifest);
    }

    it('a plugin triggering its flow records the health transition the flow sets', async () => {
      const executor = flowExecutor(
        [node('plugin-in', pluginTrigger, { deviceId: 'press-1' }), setHealth],
        [{ source: 'plugin-in', target: 'set-health', sourceHandle: 'output' }],
        healthService(fixture.service),
      );
      const context = pluginContext(
        [PluginPermission.TRIGGER_FLOWS],
        new Map([[ResourceFlowsExecutorService, executor]]),
      );

      await context.flows.trigger(pluginTrigger, (config) => config.deviceId === 'press-2', {});
      expect(await rows()).toEqual([]);
      await context.flows.trigger(pluginTrigger, (config) => config.deviceId === 'press-1', {});

      expect(await rows()).toEqual([healthTransition(1, 'manual')]);
    });

    it('a plugin calling a core service it resolved records the same row as the HTTP route', async () => {
      const servers = new MqttServerService(
        {
          create: (value: object) => ({
            id: 7,
            useTls: false,
            defaultPublishQos: 0,
            defaultPublishRetain: false,
            defaultSubscribeQos: 0,
            ...value,
          }),
          save: async (value: object) => ({ ...value, id: 7 }),
        } as never,
        { encrypt: (value: string) => `enc:${value}` } as never,
        { mqttServersTotal: { inc: jest.fn() } } as never,
        { emit: jest.fn() } as never,
        fixture.service,
      );
      const context = pluginContext([PluginPermission.RESOLVE_HOST_PROVIDERS], new Map([[MqttServerService, servers]]));
      const dto = { name: 'Workshop', host: 'mqtt.example', port: 1883, username: 'plugin', password: 'secret' };

      await new MqttServerController(servers).createOne(dto as never, req);
      // A plugin acting for the same user, e.g. from its own authenticated route.
      await context.get(MqttServerService).create(dto as never, auditActorOf(req.user));

      const [http, plugin] = await rows();
      expect(http).toEqual({
        domain: 'administration',
        pluginId: 'core',
        action: 'mqtt_server.created',
        actorId: 42,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
        outcome: 'succeeded',
        subjectType: 'mqtt-server',
        subjectId: 7,
        ipAddress: null,
        userAgent: null,
        details: {
          serverName: 'Workshop',
          host: 'mqtt.example',
          passwordChanged: 1,
          port: 1883,
          managementPort: 0,
          usernameConfigured: 1,
          useTls: 0,
          caCertConfigured: 0,
          tlsInsecure: 0,
          tlsServername: '',
          defaultPublishQos: 0,
          defaultPublishRetain: 0,
          defaultSubscribeQos: 0,
        },
      });
      expect(plugin).toEqual(http);
      expect(JSON.stringify(await rows())).not.toContain('secret');
    });

    it('plugin audit through the context reaches the host provider and stores the plugin id', async () => {
      await fixture.store.setPlainSetting('audit', 'plugin_domains_disabled', '[]');
      const context = pluginContext([], new Map([[PLUGIN_AUDIT_HOST_PROVIDER, fixture.plugins]]));
      if (!context.audit) throw new Error('the host exposes plugin audit');

      await expect(
        context.audit.record({
          action: 'demo.publication',
          operationId: randomUUID(),
          outcome: 'succeeded',
          principal: { userId: 42, authenticationMethod: 'session' },
          subject: { type: 'demo.device', id: 7 },
          details: { revision: 2 },
        }),
      ).resolves.toEqual({ status: 'recorded' });

      expect(await rows()).toEqual([
        {
          domain: 'demo',
          pluginId: fixture.fixturePluginId,
          action: 'demo.publication',
          actorId: 42,
          authenticationMethod: 'session',
          apiTokenId: null,
          outcome: 'succeeded',
          subjectType: 'demo.device',
          subjectId: 7,
          ipAddress: null,
          userAgent: null,
          details: { revision: 2 },
        },
      ]);
    });
  });
});
