// RabbitMQ detection — plugin-side business logic (ATT-521).
//
// All RabbitMQ knowledge lives here, in the plugin. The core stays
// broker-agnostic: it only hands us a generic MqttServerConnectionConfig (host,
// port, resolved credentials) through the sanctioned ACCESS_MQTT_SERVERS hook.
// We turn that into a probe of the RabbitMQ management HTTP API and cache the
// verdict so repeated UI reads (badge + status panel, per row) don't re-probe.
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { describeManagementApiError, fetchManagementApi, managementApiBase } from './rabbitmq-management-api';
import type { RabbitmqDetectionResult } from './rabbitmq-detection.types';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

// How long a verdict stays fresh. Short enough to reflect a server that just
// came online, long enough that a list of rows probes each broker once.
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  result: RabbitmqDetectionResult;
  expiresAt: number;
}

// Shape of the fields we read from RabbitMQ's GET /api/overview. Everything is
// optional — we only trust what's present.
interface RabbitmqOverview {
  rabbitmq_version?: string;
  management_version?: string;
  product_name?: string;
}

@Injectable()
export class RabbitmqDetectionService {
  // Verdicts keyed by MQTT server id. In-memory only; a restart re-probes.
  private readonly cache = new Map<number, CacheEntry>();

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  // Returns a cached verdict when fresh, otherwise probes. `forceRefresh`
  // bypasses the cache (used by the UI's manual refresh).
  async detect(mqttServerId: number, forceRefresh = false): Promise<RabbitmqDetectionResult> {
    if (!forceRefresh) {
      const cached = this.cache.get(mqttServerId);
      if (cached && cached.expiresAt > this.now()) {
        return cached.result;
      }
    }

    const result = await this.probe(mqttServerId);
    this.cache.set(mqttServerId, { result, expiresAt: this.now() + CACHE_TTL_MS });
    return result;
  }

  private async probe(mqttServerId: number): Promise<RabbitmqDetectionResult> {
    // ACCESS_MQTT_SERVERS gates this call; the core resolves + decrypts the
    // credentials and hands us a broker-agnostic config.
    const config = await this.context.getMqttServerConfig(mqttServerId);
    const checkedAt = this.nowIso();

    if (!config) {
      return {
        mqttServerId,
        isRabbitMQ: false,
        reachable: false,
        authOk: false,
        rabbitmqVersion: null,
        managementVersion: null,
        managementApi: '',
        checkedAt,
        error: 'MQTT server not found.',
      };
    }

    const managementApi = managementApiBase(config);

    let response: Response;
    try {
      response = await fetchManagementApi(config, '/api/overview');
    } catch (error) {
      // Connection refused / DNS / TLS / timeout — not reachable.
      return {
        mqttServerId,
        isRabbitMQ: false,
        reachable: false,
        authOk: false,
        rabbitmqVersion: null,
        managementVersion: null,
        managementApi,
        checkedAt,
        error: describeManagementApiError(error),
      };
    }

    // 401 from the RabbitMQ-specific /api/overview path means the management
    // API is present but rejected our credentials — it IS RabbitMQ.
    if (response.status === 401) {
      return {
        mqttServerId,
        isRabbitMQ: true,
        reachable: true,
        authOk: false,
        rabbitmqVersion: null,
        managementVersion: null,
        managementApi,
        checkedAt,
        error: 'Authentication failed (401) against the RabbitMQ management API.',
      };
    }

    if (!response.ok) {
      // Something answered, but it isn't a RabbitMQ management API.
      return {
        mqttServerId,
        isRabbitMQ: false,
        reachable: true,
        authOk: false,
        rabbitmqVersion: null,
        managementVersion: null,
        managementApi,
        checkedAt,
        error: `Unexpected response (HTTP ${response.status}) — not a RabbitMQ management API.`,
      };
    }

    const overview = await this.parseOverview(response);
    // A genuine RabbitMQ overview always reports a version. If the body isn't
    // recognisable, treat the endpoint as non-RabbitMQ despite the 200.
    const isRabbitMQ = overview !== null && typeof overview.rabbitmq_version === 'string';

    return {
      mqttServerId,
      isRabbitMQ,
      reachable: true,
      authOk: isRabbitMQ,
      rabbitmqVersion: overview?.rabbitmq_version ?? null,
      managementVersion: overview?.management_version ?? null,
      managementApi,
      checkedAt,
      error: isRabbitMQ ? null : 'Reachable, but the response is not a RabbitMQ management API.',
    };
  }

  private async parseOverview(response: Response): Promise<RabbitmqOverview | null> {
    try {
      return (await response.json()) as RabbitmqOverview;
    } catch {
      return null;
    }
  }

  private now(): number {
    return Date.now();
  }

  private nowIso(): string {
    return new Date().toISOString();
  }
}
