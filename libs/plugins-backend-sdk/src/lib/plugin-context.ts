import { DynamicModule, LoggerService, Type } from '@nestjs/common';
import type { PluginFlowNodeDefinition } from './plugin-flow-node';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { SystemEvent, SystemEventHandler, SystemEventPayload, SystemEventSubscription } from './plugin.interface';
import type { PluginEntityClass } from './entity';
import type { MqttCredentialProvisioningProviderFactory } from './mqtt-credential-provisioning';
import type { MqttCredentialProvisioningHostProvider } from './mqtt-credential-provisioning';
import type { PluginAuditContext } from './plugin-audit';

/**
 * DI token under which a plugin's own services can inject the PluginContext.
 * The host publishes the context as a module-scoped provider with this token.
 */
export const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

/**
 * Subset of the host manifest exposed to a plugin at runtime. The host's
 * LoadedPluginManifest structurally satisfies this shape.
 */
export interface PluginManifestInfo {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly pluginDirectory: string;
}

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
  readonly useTls: boolean;
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
}

/** Host flow functionality available to plugins with the TRIGGER_FLOWS permission. */
export interface PluginFlowsContext {
  /**
   * Starts a flow from every persisted trigger node of nodeType whose saved
   * configuration matches the supplied external event.
   */
  trigger(nodeType: string, matches: (config: Record<string, unknown>) => boolean, payload: object): Promise<void>;
}

/** Host-managed encryption for plugin-owned secrets. Plaintext is never persisted by the host. */
export interface PluginSecretsContext {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

/**
 * Curated facade handed to a backend plugin at load time. It is the single,
 * versioned seam between plugin code and the host application. Adding a field is
 * a minor SDK bump; removing/changing one is a major bump.
 */
export interface PluginContext {
  /** Optional for compatibility with hosts predating generic plugin audit support. */
  readonly audit?: PluginAuditContext;
  /** This plugin's own manifest (name, version, directory, id). */
  readonly manifest: PluginManifestInfo;

  /** Shared application event bus — the same EventEmitter2 instance the host uses. */
  readonly events: EventEmitter2;

  /** Shared TypeORM connection. Plugins must never re-initialise TypeOrmModule. */
  readonly dataSource: DataSource;

  /** Scoped logger, prefixed with the plugin name. */
  readonly logger: LoggerService;

  /** Shared MQTT connection access. Requires ACCESS_MQTT_SERVERS. */
  readonly mqtt: PluginMqttClient;

  /** Typed repository accessor over the shared DataSource. */
  getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T>;

  /**
   * Escape hatch to resolve an arbitrary host provider by token. Privileged:
   * this is where a future capability/permission gate is enforced.
   */
  get<T>(token: Type<T> | string | symbol): T;

  /**
   * Subscribe to a typed host SystemEvent. The handler is invoked with the
   * event's payload whenever a domain service emits it. Requires the
   * LISTEN_EVENTS permission. Returns a handle to detach the handler.
   */
  onEvent<E extends SystemEvent>(event: E, handler: SystemEventHandler<E>): SystemEventSubscription;

  /**
   * Emit a typed host SystemEvent onto the shared bus. Requires the
   * EMIT_EVENTS permission. The payload is type-checked against the event.
   */
  emitEvent<E extends SystemEvent>(event: E, payload: SystemEventPayload[E]): void;

  /**
   * Resolve an MQTT server's connection configuration, including its resolved
   * (decrypted) credentials. Requires the ACCESS_MQTT_SERVERS permission.
   * Returns null when no server with the given id exists. The host performs all
   * credential decryption; the plugin only ever receives the mapped config — it
   * stays broker-agnostic (no RabbitMQ awareness).
   */
  getMqttServerConfig(serverId: number): Promise<MqttServerConnectionConfig | null>;

  /** Discover and use the host-selected broker credential provider. Requires ACCESS_MQTT_SERVERS. */
  getMqttCredentialProvisioning(): MqttCredentialProvisioningHostProvider;

  /** Start matching flows from a plugin-declared trigger node. Requires TRIGGER_FLOWS. */
  readonly flows: PluginFlowsContext;

  /** Encrypt and decrypt plugin-owned secret material. Requires MANAGE_SECRETS. */
  readonly secrets: PluginSecretsContext;
}

/**
 * Shape every backend plugin's default export must satisfy. The host calls
 * register(context) at load time to obtain the plugin's Nest module definition.
 */
export interface PluginBackendModule {
  register(context: PluginContext): DynamicModule;

  /**
   * Optional TypeORM entity classes this plugin owns. The host registers their
   * metadata into the shared DataSource at load time so the plugin can query
   * them through {@link PluginContext.getRepository}. The schema itself is owned
   * by the plugin's migrations (the host runs with `synchronize: false`), so an
   * entity here describes an existing table rather than creating one. Requires
   * the DATABASE_ACCESS permission. See `docs/en/plugins/database-migrations.md`.
   */
  entities?: PluginEntityClass[];

  /**
   * Optional custom flow node types this plugin contributes. The host registers
   * them into the flow engine so they appear in the frontend node catalog and
   * can be executed like built-in node types. No extra permission is required.
   *
   * Type naming convention: "plugin.<pluginName>.<nodeName>".
   */
  flowNodes?: PluginFlowNodeDefinition[] | ((context: PluginContext) => PluginFlowNodeDefinition[]);

  /** Optional broker credential provider offered to other integrations by this plugin. */
  credentialProvisioningProvider?: MqttCredentialProvisioningProviderFactory;
}
