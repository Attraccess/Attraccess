import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Auth } from '@attraccess/plugins-backend-sdk';
import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { list, num, requireMqttServerConfig, str } from '../management/config';
import { RabbitmqManagementClient } from '../management/client';
import { RABBITMQ_MANAGE_PERMISSION, RABBITMQ_VIEW_PERMISSION } from '../permissions';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

// Upper bound on rows sent to the browser; a broker with more connections is
// reported as truncated rather than shipping an unbounded payload.
const MAX_CONNECTIONS = 1000;
const MAX_REASON_LENGTH = 200;

// Mirrored on the frontend in frontend/src/connections/connections-api.ts.
export interface RabbitmqConnection {
  // Unique management name, used to close the connection.
  readonly name: string;
  // Client id (MQTT) / connection_name property when the client set one.
  readonly clientId: string | null;
  readonly user: string | null;
  readonly vhost: string | null;
  readonly peerHost: string | null;
  readonly peerPort: number | null;
  readonly protocol: string | null;
  readonly state: string | null;
  readonly ssl: boolean;
  // Epoch milliseconds.
  readonly connectedAt: number | null;
  readonly channels: number | null;
  readonly recvBytes: number | null;
  readonly sendBytes: number | null;
  // Bytes per second.
  readonly recvRate: number | null;
  readonly sendRate: number | null;
}

export interface RabbitmqConnectionList {
  readonly mqttServerId: number;
  readonly total: number;
  readonly truncated: boolean;
  readonly connections: RabbitmqConnection[];
}

@Injectable()
export class RabbitmqConnectionsService {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(RabbitmqManagementClient) private readonly client: RabbitmqManagementClient,
  ) {}

  async listConnections(mqttServerId: number): Promise<RabbitmqConnectionList> {
    const config = await requireMqttServerConfig(this.context, mqttServerId);
    const raw = await this.client.request<unknown>(config, 'GET', '/connections');

    const all = list(raw)
      .map((row): RabbitmqConnection | null => {
        const name = str(row.name);
        if (!name) return null;
        const properties = (row.client_properties ?? {}) as Record<string, unknown>;
        return {
          name,
          clientId: str(properties.connection_name) ?? str(properties.client_id),
          user: str(row.user),
          vhost: str(row.vhost),
          peerHost: str(row.peer_host),
          peerPort: num(row.peer_port),
          protocol: str(row.protocol),
          state: str(row.state),
          ssl: row.ssl === true,
          connectedAt: num(row.connected_at),
          channels: num(row.channels),
          recvBytes: num(row.recv_oct),
          sendBytes: num(row.send_oct),
          recvRate: num((row.recv_oct_details as Record<string, unknown> | undefined)?.rate),
          sendRate: num((row.send_oct_details as Record<string, unknown> | undefined)?.rate),
        };
      })
      .filter((row): row is RabbitmqConnection => row !== null)
      .sort((a, b) => (a.clientId ?? a.name).localeCompare(b.clientId ?? b.name));

    return {
      mqttServerId,
      total: all.length,
      truncated: all.length > MAX_CONNECTIONS,
      connections: all.slice(0, MAX_CONNECTIONS),
    };
  }

  async closeConnection(mqttServerId: number, name: string, reason?: string): Promise<void> {
    if (typeof name !== 'string' || name.length === 0 || name.length > 1024) {
      throw new HttpException('A connection name is required.', HttpStatus.BAD_REQUEST);
    }
    const config = await requireMqttServerConfig(this.context, mqttServerId);
    const headers: Record<string, string> = {};
    // X-Reason travels as an HTTP header: keep it to printable ASCII.
    const cleaned = (reason ?? '')
      .replace(/[^\x20-\x7e]/g, '?')
      .trim()
      .slice(0, MAX_REASON_LENGTH);
    if (cleaned.length > 0) headers['x-reason'] = cleaned;
    await this.client.request(config, 'DELETE', `/connections/${encodeURIComponent(name)}`, undefined, headers);
  }
}

@Controller('rabbitmq')
export class RabbitmqConnectionsController {
  // esbuild does not emit decorator metadata, so Nest cannot infer constructor
  // types for injection — always inject by an explicit token.
  constructor(@Inject(RabbitmqConnectionsService) private readonly connections: RabbitmqConnectionsService) {}

  @Auth(RABBITMQ_VIEW_PERMISSION)
  @Get('connections/:mqttServerId')
  list(@Param('mqttServerId', ParseIntPipe) mqttServerId: number): Promise<RabbitmqConnectionList> {
    return this.connections.listConnections(mqttServerId);
  }

  // The connection name contains spaces, colons and arrows, so it travels as a
  // query parameter rather than a path segment.
  @Auth(RABBITMQ_MANAGE_PERMISSION)
  @Delete('connections/:mqttServerId')
  close(
    @Param('mqttServerId', ParseIntPipe) mqttServerId: number,
    @Query('name') name: string,
    @Query('reason') reason?: string,
  ): Promise<void> {
    return this.connections.closeConnection(mqttServerId, name, reason);
  }
}
