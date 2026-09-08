// RabbitMQ detection — plugin-side business logic (ATT-521).
//
// All RabbitMQ knowledge lives here, in the plugin. The core stays
// broker-agnostic: it only hands us a generic MqttServerConnectionConfig (host,
// port, resolved credentials) through the sanctioned ACCESS_MQTT_SERVERS hook.
// We turn that into a probe of the RabbitMQ management HTTP API and cache the
// verdict so repeated UI reads (badge + status panel, per row) don't re-probe.
import type { MqttServerConnectionConfig, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { RabbitmqDetectionResult } from './rabbitmq-detection.types';
import { describeManagementError, managementApiBase, managementRequest } from './rabbitmq-management-transport';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

// Default RabbitMQ management API ports. The management API is independent of
// the MQTT listener, so we cannot reuse the MQTT port — RabbitMQ serves
// management over 15672 (HTTP) / 15671 (HTTPS) by convention.

// How long a verdict stays fresh. Short enough to reflect a server that just
// came online, long enough that a list of rows probes each broker once.
const CACHE_TTL_MS = 60_000;

// Probe timeout — a broker that doesn't answer quickly is treated as
// unreachable rather than blocking the request.
const PROBE_TIMEOUT_MS = 5_000;

interface CacheEntry {
  configKey: string;
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
    const config = await this.context.getMqttServerConfig(mqttServerId);
    // Never reuse a verdict obtained with different credentials or TLS trust.
    const configKey = createHash('sha256')
      .update(JSON.stringify(config ?? null))
      .digest('hex');
    if (!forceRefresh) {
      const cached = this.cache.get(mqttServerId);
      if (cached && cached.configKey === configKey && cached.expiresAt > this.now()) {
        return cached.result;
      }
    }

    const result = await this.probe(mqttServerId, config);
    this.cache.set(mqttServerId, { result, configKey, expiresAt: this.now() + CACHE_TTL_MS });
    return result;
  }

  private async probe(
    mqttServerId: number,
    config: MqttServerConnectionConfig | null,
  ): Promise<RabbitmqDetectionResult> {
    // ACCESS_MQTT_SERVERS gates this call; the core resolves + decrypts the
    // credentials and hands us a broker-agnostic config.
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

    const managementApi = this.managementApiBase(config);

    let response: Response;
    try {
      response = await this.fetchOverview(managementApi, config);
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
        error: this.describeError(error),
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

  // Builds the management API base URL from the generic MQTT config. The
  // management API runs on its own port, so we substitute the conventional
  // management port for the MQTT one and pick the scheme from useTls.
  private managementApiBase(config: MqttServerConnectionConfig): string {
    return managementApiBase(config);
  }

  private async fetchOverview(managementApi: string, config: MqttServerConnectionConfig): Promise<Response> {
    return managementRequest(config, `${managementApi}/api/overview`, 'GET', undefined, PROBE_TIMEOUT_MS);
  }

  private async parseOverview(response: Response): Promise<RabbitmqOverview | null> {
    try {
      return (await response.json()) as RabbitmqOverview;
    } catch {
      return null;
    }
  }

  private describeError(error: unknown): string {
    return describeManagementError(error, PROBE_TIMEOUT_MS);
  }

  private now(): number {
    return Date.now();
  }

  private nowIso(): string {
    return new Date().toISOString();
  }
}
