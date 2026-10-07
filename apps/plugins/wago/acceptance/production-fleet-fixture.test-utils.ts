import { ResourceFlowEdge, ResourceFlowNode } from '@attraccess/database-entities';
import { type MqttClient } from 'mqtt';
import { type Server, type Socket } from 'node:net';
import { join } from 'node:path';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { WagoFlowService } from '../backend/wago-flow.service';
import { WagoService } from '../backend/wago.service';
import { WagoRuntime, type Snapshot } from '../cc100-runtime/src/runtime';
import { base, Log, temporary, Wire } from './production-fleet-globals.test-utils';

export class FleetFixtureState {
  database!: DataSource;
  runtime!: WagoRuntime;
  backend!: WagoService;
  flow!: WagoFlowService;
  flowBinding!: { onModuleDestroy(): void } | undefined;
  deviceClient!: MqttClient;
  backendClient!: MqttClient;
  observer!: MqttClient;
  server!: Server;
  snapshot!: Snapshot;
  controllerId!: number;
  modbusRaw = 12.375;
  holdAcknowledgement = false;
  heldAcknowledgement!: { topic: string; payload: unknown; release: () => Promise<void> } | undefined;
  sockets = new Set<Socket>();
  messages: Wire[] = [];
  processedAcknowledgements = new Set<string>();
  errors: unknown[] = [];
  warnings: string[] = [];
  logs: Log[] = [];
  modbusRequests: Buffer[] = [];
  nodes: ResourceFlowNode[] = [];
  edges: ResourceFlowEdge[] = [];
  din = join(temporary ?? '', 'din');
  dout = join(temporary ?? '', 'dout');
  statePath = join(temporary ?? '', 'runtime.json');
  query = (channelId: string, category = 'state') => ({ controllerId: this.controllerId, channelId, category });
  completed = (id: string) => this.logs.filter((log) => log.nodeId === id && log.type === 'node.processing.completed');
  wire = (suffix: string) => this.messages.filter((message) => message.topic === `${base}/${suffix}`);
  graph(id: string, source: string, category: string, equals: boolean | number, output: string) {
    const definitions = [
      ['event-received', { ...this.query(source, category), minimumIntervalMs: 60_000 }],
      ['read-state', this.query(source, category)],
      ['wait-for-state', { ...this.query(source, category), equals, timeoutMs: 4000 }],
      [
        'command',
        {
          controllerId: this.controllerId,
          channelId: output,
          action: 'set',
          value: true,
          expectedConfigurationRevision: 1,
          completionBehavior: 'acknowledged',
          acknowledgementTimeoutSeconds: 5,
          failureBehavior: 'fail-flow',
        },
      ],
    ] as const;
    definitions.forEach(([type, data], index) => {
      this.nodes.push(
        Object.assign(new ResourceFlowNode(), {
          id: `${id}-${index}`,
          type: `plugin.wago.${type}`,
          resourceId: 1,
          data,
          position: { x: index * 100, y: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      if (index)
        this.edges.push({
          source: `${id}-${index - 1}`,
          target: `${id}-${index}`,
          sourceHandle: 'output',
        } as ResourceFlowEdge);
    });
  }

  constructor() {
    this.graph = this.graph.bind(this);
  }
}
