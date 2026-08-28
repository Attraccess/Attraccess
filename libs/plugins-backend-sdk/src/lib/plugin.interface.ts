import { Resource, User } from '@attraccess/database-entities';

export enum SystemEvent {
  RESOURCE_USAGE_STARTED = 'RESOURCE_USAGE_STARTED',
  RESOURCE_USAGE_ENDED = 'RESOURCE_USAGE_ENDED',
}

export type SystemEventPayload = {
  [SystemEvent.RESOURCE_USAGE_STARTED]: { resource: Resource; user: User };
  [SystemEvent.RESOURCE_USAGE_ENDED]: { resource: Resource; user: User };
};

export type SystemEventResponse = {
  [SystemEvent.RESOURCE_USAGE_STARTED]: null;
  [SystemEvent.RESOURCE_USAGE_ENDED]: null;
};

/**
 * Typed handler a plugin registers for a given SystemEvent. It receives the
 * event's payload and may return the matching response (sync or async). Thrown
 * errors are isolated by the host and never propagate into the core flow.
 */
export type SystemEventHandler<E extends SystemEvent> = (
  payload: SystemEventPayload[E]
) => SystemEventResponse[E] | void | Promise<SystemEventResponse[E] | void>;

/**
 * Handle returned by PluginContext.onEvent. Calling off() detaches the handler
 * from the shared bus. Detaching twice is a no-op.
 */
export interface SystemEventSubscription {
  off(): void;
}

/**
 * Discrete host capabilities a plugin may request in its manifest. A plugin can
 * only use a capability whose permission it declared; the sandbox throws on any
 * undeclared access. Each value gates exactly one seam of the PluginContext.
 */
export enum PluginPermission {
  /** Read the User repository via getRepository(User). */
  READ_USERS = 'READ_USERS',
  /** Read/write the Resource repository via getRepository(Resource). */
  ACCESS_RESOURCES = 'ACCESS_RESOURCES',
  /** Read the Setting repository via getRepository(Setting). */
  READ_SETTINGS = 'READ_SETTINGS',
  /** Access any other repository and the raw dataSource. */
  DATABASE_ACCESS = 'DATABASE_ACCESS',
  /** Publish events on the shared event bus (events.emit / emitAsync). */
  EMIT_EVENTS = 'EMIT_EVENTS',
  /** Subscribe to events on the shared event bus (events.on / once / ...). */
  LISTEN_EVENTS = 'LISTEN_EVENTS',
  /** Resolve arbitrary host providers by token via context.get(). */
  RESOLVE_HOST_PROVIDERS = 'RESOLVE_HOST_PROVIDERS',
  /** Read an MQTT server's connection config + resolved credentials via getMqttServerConfig(). */
  ACCESS_MQTT_SERVERS = 'ACCESS_MQTT_SERVERS',
  /** Start flows from plugin-declared trigger nodes via flows.trigger(). */
  TRIGGER_FLOWS = 'TRIGGER_FLOWS',
}

/**
 * Human-readable description of each permission, surfaced to admins and plugin
 * authors. Keep in sync with the PluginPermission enum.
 */
export const PLUGIN_PERMISSION_DESCRIPTIONS: Record<PluginPermission, string> = {
  [PluginPermission.READ_USERS]: 'Read user accounts from the database.',
  [PluginPermission.ACCESS_RESOURCES]: 'Read and write resources from the database.',
  [PluginPermission.READ_SETTINGS]: 'Read application settings from the database.',
  [PluginPermission.DATABASE_ACCESS]: 'Access the raw database connection and any other entity repository.',
  [PluginPermission.EMIT_EVENTS]: 'Publish events on the shared application event bus.',
  [PluginPermission.LISTEN_EVENTS]: 'Subscribe to events on the shared application event bus.',
  [PluginPermission.RESOLVE_HOST_PROVIDERS]: 'Resolve arbitrary host services by injection token.',
  [PluginPermission.ACCESS_MQTT_SERVERS]: "Read an MQTT server's connection configuration and resolved credentials.",
  [PluginPermission.TRIGGER_FLOWS]: 'Start flows from plugin-declared trigger nodes.',
};

/**
 * Returns true when the given string is a known PluginPermission value.
 */
export function isPluginPermission(value: string): value is PluginPermission {
  return Object.prototype.hasOwnProperty.call(PLUGIN_PERMISSION_DESCRIPTIONS, value);
}

/**
 * Thrown when a plugin accesses a host capability whose permission it did not
 * declare in its manifest. The message names the plugin, the capability and the
 * permission that would unlock it.
 */
export class PluginPermissionError extends Error {
  public readonly pluginName: string;
  public readonly capability: string;
  public readonly requiredPermission: PluginPermission;

  constructor(pluginName: string, capability: string, requiredPermission: PluginPermission) {
    super(
      `Plugin "${pluginName}" attempted to use "${capability}", which requires the ` +
        `"${requiredPermission}" permission. Declare it in the "permissions" array of the plugin manifest.`
    );
    this.name = 'PluginPermissionError';
    this.pluginName = pluginName;
    this.capability = capability;
    this.requiredPermission = requiredPermission;
  }
}
