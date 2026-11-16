import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { Controller, Get, Inject, Injectable, Param, ParseIntPipe } from '@nestjs/common';
import { list, num, rec, requireMqttServerConfig, str } from '../management/config';
import { RabbitmqManagementClient } from '../management/client';
import { RABBITMQ_VIEW_PERMISSION } from '../permissions';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');
const MAX_QUEUES = 1000;
// Only the fields the node mapper reads; a full node object carries large
// `_details` and runtime blocks.
const NODE_COLUMNS = [
  'name',
  'running',
  'mem_used',
  'mem_limit',
  'mem_alarm',
  'disk_free',
  'disk_free_limit',
  'disk_free_alarm',
  'fd_used',
  'fd_total',
  'sockets_used',
  'sockets_total',
  'uptime',
].join(',');

// Mirrored on the frontend in frontend/src/stats/stats-api.ts. Every number is
// nullable: older RabbitMQ versions omit fields.
export interface RabbitmqOverview {
  readonly rabbitmqVersion: string | null;
  readonly erlangVersion: string | null;
  readonly clusterName: string | null;
  readonly connections: number | null;
  readonly channels: number | null;
  readonly queues: number | null;
  readonly consumers: number | null;
  readonly messagesReady: number | null;
  readonly messagesUnacknowledged: number | null;
  readonly publishRate: number | null;
  readonly deliverRate: number | null;
}

export interface RabbitmqNode {
  readonly name: string;
  readonly running: boolean | null;
  readonly memUsed: number | null;
  readonly memLimit: number | null;
  readonly memAlarm: boolean | null;
  readonly diskFree: number | null;
  readonly diskFreeLimit: number | null;
  readonly diskFreeAlarm: boolean | null;
  readonly fdUsed: number | null;
  readonly fdTotal: number | null;
  readonly socketsUsed: number | null;
  readonly socketsTotal: number | null;
  // Milliseconds.
  readonly uptime: number | null;
}

export interface RabbitmqQueue {
  readonly vhost: string;
  readonly name: string;
  readonly type: string | null;
  readonly state: string | null;
  readonly messagesReady: number | null;
  readonly messagesUnacknowledged: number | null;
  readonly consumers: number | null;
}

export interface RabbitmqStats {
  readonly mqttServerId: number;
  readonly overview: RabbitmqOverview;
  readonly nodes: RabbitmqNode[];
  readonly queues: RabbitmqQueue[];
  readonly totalQueues: number;
}

const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

@Injectable()
export class RabbitmqStatsService {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(RabbitmqManagementClient) private readonly client: RabbitmqManagementClient,
  ) {}

  async getStats(mqttServerId: number): Promise<RabbitmqStats> {
    const config = await requireMqttServerConfig(this.context, mqttServerId);
    const [rawOverview, rawNodes, rawQueues] = await Promise.all([
      this.client.request<unknown>(config, 'GET', '/overview'),
      this.client.request<unknown>(config, 'GET', `/nodes?columns=${NODE_COLUMNS}`),
      this.client.request<unknown>(
        config,
        'GET',
        '/queues?columns=vhost,name,type,state,messages_ready,messages_unacknowledged,consumers',
      ),
    ]);

    const overview = rec(rawOverview);
    const totals = rec(overview.object_totals);
    const queueTotals = rec(overview.queue_totals);
    const messageStats = rec(overview.message_stats);

    const queues = list(rawQueues)
      .map((row): RabbitmqQueue => ({
        vhost: str(row.vhost) ?? '/',
        name: str(row.name) ?? '',
        type: str(row.type),
        state: str(row.state),
        messagesReady: num(row.messages_ready),
        messagesUnacknowledged: num(row.messages_unacknowledged),
        consumers: num(row.consumers),
      }))
      .sort((a, b) => a.vhost.localeCompare(b.vhost) || a.name.localeCompare(b.name));

    return {
      mqttServerId,
      overview: {
        rabbitmqVersion: str(overview.rabbitmq_version),
        erlangVersion: str(overview.erlang_version),
        clusterName: str(overview.cluster_name),
        connections: num(totals.connections),
        channels: num(totals.channels),
        queues: num(totals.queues),
        consumers: num(totals.consumers),
        messagesReady: num(queueTotals.messages_ready),
        messagesUnacknowledged: num(queueTotals.messages_unacknowledged),
        publishRate: num(rec(messageStats.publish_details).rate),
        deliverRate: num(rec(messageStats.deliver_get_details).rate),
      },
      nodes: list(rawNodes)
        .map((row): RabbitmqNode => ({
          name: str(row.name) ?? '',
          running: bool(row.running),
          memUsed: num(row.mem_used),
          memLimit: num(row.mem_limit),
          memAlarm: bool(row.mem_alarm),
          diskFree: num(row.disk_free),
          diskFreeLimit: num(row.disk_free_limit),
          diskFreeAlarm: bool(row.disk_free_alarm),
          fdUsed: num(row.fd_used),
          fdTotal: num(row.fd_total),
          socketsUsed: num(row.sockets_used),
          socketsTotal: num(row.sockets_total),
          uptime: num(row.uptime),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      queues: queues.slice(0, MAX_QUEUES),
      totalQueues: queues.length,
    };
  }
}

@Auth(RABBITMQ_VIEW_PERMISSION)
@Controller('rabbitmq')
export class RabbitmqStatsController {
  constructor(@Inject(RabbitmqStatsService) private readonly stats: RabbitmqStatsService) {}

  @Get('stats/:mqttServerId')
  get(@Param('mqttServerId', ParseIntPipe) mqttServerId: number): Promise<RabbitmqStats> {
    return this.stats.getStats(mqttServerId);
  }
}
