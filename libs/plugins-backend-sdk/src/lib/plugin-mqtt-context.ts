/**
 * DI token under which the host registers its MqttServerHostProvider
 * implementation. The plugin context resolves the provider through this token;
 * plugins never reference it directly — they call getMqttServerConfig instead.
 */
export const MQTT_SERVER_HOST_PROVIDER = Symbol.for('attraccess.plugin.mqttServerHostProvider');

/**
 * Connection configuration for a single MQTT server, including its resolved
 * (decrypted) credentials. A generic, broker-agnostic shape carrying only the
 * fields a plugin needs to open a connection or call a server's management API.
 */
export interface MqttServerConnectionConfig {
  readonly id: number;
  readonly name: string;
  readonly host: string;
  readonly port: number;
  /** Management API port on the same host (1-65535). Null/omitted uses the provider default. */
  readonly managementPort?: number | null;
  readonly useTls: boolean;
  /** PEM trust anchors for private PKI. Omitted by older hosts. */
  readonly caCert?: string | null;
  /** Integrations requiring authenticated TLS must reject this setting. */
  readonly tlsInsecure?: boolean;
  readonly tlsServername?: string | null;
  readonly username: string | null;
  /** Resolved (decrypted) password. Only ever provided to permitted plugins. */
  readonly password: string | null;
  readonly clientId: string | null;
}

/**
 * Host-side provider that resolves an MQTT server's connection config. The core
 * application implements this — all credential decryption stays core-side — and
 * registers it under MQTT_SERVER_HOST_PROVIDER. Plugins reach it only through
 * PluginContext.getMqttServerConfig, gated by the ACCESS_MQTT_SERVERS permission.
 */
export interface MqttServerHostProvider {
  getServerConfig(serverId: number): Promise<MqttServerConnectionConfig | null>;
}

/** A message delivered to a plugin's MQTT subscription. */
export interface PluginMqttMessage {
  readonly serverId: number;
  readonly topic: string;
  readonly payload: Buffer;
}

/** Handle returned from an MQTT subscription. */
export interface PluginMqttSubscription {
  unsubscribe(): void;
}

export interface PluginMqttClient {
  /**
   * Subscribe through the host's shared MQTT connection. MQTT wildcards `+`
   * and `#` are supported. Resolves after the broker acknowledges the
   * subscription. Handlers run serially; each subscription buffers up to 100
   * messages and drops new messages while full. The returned handle detaches
   * the handler.
   */
  subscribe(
    serverId: number,
    topicFilter: string,
    handler: (message: PluginMqttMessage) => void | Promise<void>,
  ): Promise<PluginMqttSubscription>;

  /** Publish through the host's shared MQTT connection. */
  publish(
    serverId: number,
    topic: string,
    payload: string | Buffer,
    options?: { qos?: 0 | 1 | 2; retain?: boolean },
  ): Promise<void>;

  /** Reconnect using current configured settings and restore shared topic
   * registrations. Optional for compatibility with older host runtimes.
   */
  refreshConnection?(serverId: number): Promise<void>;
}
