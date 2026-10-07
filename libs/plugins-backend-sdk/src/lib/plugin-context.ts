import { LoggerService, Type } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import type { MqttCredentialProvisioningHostProvider } from './mqtt-credential-provisioning';
import type { PluginAuditContext } from './plugin-audit';
import { MqttServerConnectionConfig, PluginMqttClient } from './plugin-mqtt-context';
import { SystemEvent, SystemEventHandler, SystemEventPayload, SystemEventSubscription } from './plugin.interface';

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

/** Host flow functionality available to plugins with the TRIGGER_FLOWS permission. */
export interface PluginFlowsContext {
  /**
   * Starts a flow from every persisted trigger node of nodeType whose saved
   * configuration matches the supplied external event.
   */
  trigger(
    nodeType: string,
    matches: (config: Record<string, unknown>, nodeId: string) => boolean,
    payload: object,
  ): Promise<void>;
}

/** Host-managed encryption for secret material owned by this plugin. */
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
   * stays broker-agnostic (no broker-vendor awareness).
   */
  getMqttServerConfig(serverId: number): Promise<MqttServerConnectionConfig | null>;

  /** Discover and use the host-selected broker credential provider. Requires ACCESS_MQTT_SERVERS. */
  getMqttCredentialProvisioning(): MqttCredentialProvisioningHostProvider;

  /** Start matching flows from a plugin-declared trigger node. Requires TRIGGER_FLOWS. */
  readonly flows: PluginFlowsContext;

  /** Encrypt and decrypt this plugin's secret material. Requires MANAGE_SECRETS. */
  readonly secrets: PluginSecretsContext;
}

export { PluginBackendModule } from './plugin-backend-module';
export {
  MQTT_SERVER_HOST_PROVIDER,
  MqttServerConnectionConfig,
  MqttServerHostProvider,
  PluginMqttClient,
  PluginMqttMessage,
  PluginMqttSubscription,
} from './plugin-mqtt-context';
