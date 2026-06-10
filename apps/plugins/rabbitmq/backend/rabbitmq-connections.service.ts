// RabbitMQ connections viewer — plugin-side business logic (ATT-523).
//
// Lists the broker's currently connected clients via the management API's
// GET /api/connections and, on request, force-closes one via
// DELETE /api/connections/<name>. Like detection (ATT-521), all RabbitMQ
// knowledge stays here — the core only hands us the generic MQTT server config
// through the sanctioned ACCESS_MQTT_SERVERS hook. No caching: a connections
// snapshot is only useful live, and the UI polls explicitly.
import type { MqttServerConnectionConfig, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { describeManagementApiError, fetchManagementApi } from './rabbitmq-management-api';
import type {
  RabbitmqCloseConnectionResult,
  RabbitmqConnection,
  RabbitmqConnectionsResult,
} from './rabbitmq-connections.types';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

// Shape of the fields we read from one entry of RabbitMQ's
// GET /api/connections. Everything is optional — we only trust what's present.
interface RawConnection {
  name?: string;
  user?: string;
  vhost?: string;
  peer_host?: string;
  peer_port?: number;
  protocol?: string;
  state?: string;
  ssl?: boolean;
  channels?: number;
  connected_at?: number;
  recv_oct?: number;
  send_oct?: number;
  recv_oct_details?: { rate?: number };
  send_oct_details?: { rate?: number };
  client_properties?: { client_id?: string; [key: string]: unknown };
}

@Injectable()
export class RabbitmqConnectionsService {
  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  // Snapshot of the broker's current connections. Never throws — failures come
  // back as `ok: false` with a human-readable error, mirroring detection.
  async list(mqttServerId: number): Promise<RabbitmqConnectionsResult> {
    const checkedAt = new Date().toISOString();

    const config = await this.context.getMqttServerConfig(mqttServerId);
    if (!config) {
      return { mqttServerId, ok: false, connections: [], checkedAt, error: 'MQTT server not found.' };
    }

    let response: Response;
    try {
      response = await fetchManagementApi(config, '/api/connections');
    } catch (error) {
      return { mqttServerId, ok: false, connections: [], checkedAt, error: describeManagementApiError(error) };
    }

    if (!response.ok) {
      return {
        mqttServerId,
        ok: false,
        connections: [],
        checkedAt,
        error: this.describeHttpError(response.status),
      };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!Array.isArray(body)) {
      return {
        mqttServerId,
        ok: false,
        connections: [],
        checkedAt,
        error: 'Unexpected response — not a RabbitMQ connections listing.',
      };
    }

    return {
      mqttServerId,
      ok: true,
      connections: (body as RawConnection[]).map((raw) => this.mapConnection(raw)),
      checkedAt,
      error: null,
    };
  }

  // Force-closes one connection by its broker-side name. The management API
  // accepts an X-Reason header which RabbitMQ relays to the client.
  async close(mqttServerId: number, name: string): Promise<RabbitmqCloseConnectionResult> {
    const config = await this.context.getMqttServerConfig(mqttServerId);
    if (!config) {
      return { mqttServerId, name, closed: false, error: 'MQTT server not found.' };
    }

    let response: Response;
    try {
      response = await this.deleteConnection(config, name);
    } catch (error) {
      return { mqttServerId, name, closed: false, error: describeManagementApiError(error) };
    }

    // 204 on success; 404 when the connection is already gone — treat that as
    // closed, since the desired end state holds.
    if (response.status === 404) {
      return { mqttServerId, name, closed: true, error: null };
    }
    if (!response.ok) {
      return { mqttServerId, name, closed: false, error: this.describeHttpError(response.status) };
    }

    this.context.logger.log(`Force-closed RabbitMQ connection "${name}" on MQTT server ${mqttServerId}.`);
    return { mqttServerId, name, closed: true, error: null };
  }

  private deleteConnection(config: MqttServerConnectionConfig, name: string): Promise<Response> {
    // Connection names contain spaces and arrows ("ip:port -> ip:port") —
    // encode for the path segment.
    return fetchManagementApi(config, `/api/connections/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  private mapConnection(raw: RawConnection): RabbitmqConnection {
    return {
      name: raw.name ?? '',
      clientId: typeof raw.client_properties?.client_id === 'string' ? raw.client_properties.client_id : null,
      user: raw.user ?? null,
      vhost: raw.vhost ?? null,
      peerHost: raw.peer_host ?? null,
      peerPort: typeof raw.peer_port === 'number' ? raw.peer_port : null,
      protocol: raw.protocol ?? null,
      state: raw.state ?? null,
      ssl: raw.ssl === true,
      channels: typeof raw.channels === 'number' ? raw.channels : null,
      connectedAt: typeof raw.connected_at === 'number' ? new Date(raw.connected_at).toISOString() : null,
      recvBytes: typeof raw.recv_oct === 'number' ? raw.recv_oct : null,
      sendBytes: typeof raw.send_oct === 'number' ? raw.send_oct : null,
      recvRate: typeof raw.recv_oct_details?.rate === 'number' ? raw.recv_oct_details.rate : null,
      sendRate: typeof raw.send_oct_details?.rate === 'number' ? raw.send_oct_details.rate : null,
    };
  }

  private describeHttpError(status: number): string {
    if (status === 401) {
      return 'Authentication failed (401) against the RabbitMQ management API.';
    }
    if (status === 403) {
      return 'The configured user is not authorised (403) for the RabbitMQ management API.';
    }
    return `Unexpected response (HTTP ${status}) from the RabbitMQ management API.`;
  }
}
