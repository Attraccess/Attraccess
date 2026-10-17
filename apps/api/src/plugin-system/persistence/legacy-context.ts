import type {
  MqttCredentialProvisioningHostProvider,
  MqttServerConnectionConfig,
  PluginFlowsContext,
  PluginSecretsContext,
  SystemEvent,
  SystemEventHandler,
  SystemEventPayload,
  SystemEventSubscription,
} from '@attraccess/plugins-backend-sdk';
import type { EntityTarget, ObjectLiteral } from '@attraccess/plugins-backend-sdk';
import { PluginContext, PluginPermission, PluginPermissionError } from '@attraccess/plugins-backend-sdk';
import { Injectable, Type } from '@nestjs/common';
import { Resource, Setting, User } from '@attraccess/database-entities';

export const EVENT_METHOD_PERMISSIONS = new Map<string, PluginPermission>([
  ['emit', PluginPermission.EMIT_EVENTS],
  ['emitAsync', PluginPermission.EMIT_EVENTS],
  ['on', PluginPermission.LISTEN_EVENTS],
  ['once', PluginPermission.LISTEN_EVENTS],
  ['addListener', PluginPermission.LISTEN_EVENTS],
  ['prependListener', PluginPermission.LISTEN_EVENTS],
  ['prependOnceListener', PluginPermission.LISTEN_EVENTS],
  ['many', PluginPermission.LISTEN_EVENTS],
  ['prependMany', PluginPermission.LISTEN_EVENTS],
  ['onAny', PluginPermission.LISTEN_EVENTS],
  ['prependAny', PluginPermission.LISTEN_EVENTS],
  ['off', PluginPermission.LISTEN_EVENTS],
  ['offAny', PluginPermission.LISTEN_EVENTS],
  ['removeListener', PluginPermission.LISTEN_EVENTS],
  ['waitFor', PluginPermission.LISTEN_EVENTS],
]);

export const ENTITY_PERMISSIONS: Array<{ target: EntityTarget<ObjectLiteral>; permission: PluginPermission }> = [
  { target: User, permission: PluginPermission.READ_USERS },
  { target: Resource, permission: PluginPermission.ACCESS_RESOURCES },
  { target: Setting, permission: PluginPermission.READ_SETTINGS },
];

export function entityLabel<T extends ObjectLiteral>(entity: EntityTarget<T>): string {
  if (typeof entity === 'string') {
    return entity;
  }
  if (typeof entity === 'function') {
    return entity.name;
  }
  const named = entity as { name?: string; options?: { name?: string } };
  return named.options?.name ?? named.name ?? 'UnknownEntity';
}

export function permissionForEntity<T extends ObjectLiteral>(
  base: PluginContext,
  entity: EntityTarget<T>,
): PluginPermission {
  const direct = ENTITY_PERMISSIONS.find((candidate) => candidate.target === entity);
  if (direct) {
    return direct.permission;
  }

  try {
    const resolved = base.dataSource.getMetadata(entity).target;
    const match = ENTITY_PERMISSIONS.find((candidate) => candidate.target === resolved);
    if (match) {
      return match.permission;
    }
  } catch {
    return PluginPermission.DATABASE_ACCESS;
  }

  return PluginPermission.DATABASE_ACCESS;
}

@Injectable()
export class LegacyPluginSandbox {
  /** Also called when a repository retained during bootstrap is first resolved. */
  public static assertRepositoryPermission(
    base: PluginContext,
    declared: PluginPermission[],
    entity: EntityTarget<ObjectLiteral>,
  ): void {
    const permission = permissionForEntity(base, entity);
    if (!declared.includes(permission)) {
      throw new PluginPermissionError(base.manifest.name, `getRepository(${entityLabel(entity)})`, permission);
    }
  }

  /**
   * Wraps a raw PluginContext so every host capability is gated by the plugin's
   * declared permissions. Accessing an undeclared capability throws a
   * PluginPermissionError naming the missing permission. The wrapper is
   * deny-by-default: only explicitly modelled capabilities are reachable.
   */
  public static createGuardedContext(base: PluginContext, declared: PluginPermission[]): PluginContext {
    const getContextOwner = () => this;
    return createGuardedContextImplementation(
      {
        guardEvents: getContextOwner().guardEvents.bind(getContextOwner()),
        assertRepositoryPermission: getContextOwner().assertRepositoryPermission.bind(getContextOwner()),
      },
      base,
      declared,
    );
  }

  private static guardEvents(
    base: PluginContext,
    pluginName: string,
    require: (permission: PluginPermission, capability: string) => void,
  ): PluginContext['events'] {
    const holder: { proxy: PluginContext['events'] | null } = { proxy: null };

    const sanitize = (emitter: unknown, result: unknown): unknown => {
      if (result === emitter) {
        return holder.proxy;
      }
      if (result && typeof result === 'object' && 'emitter' in (result as object)) {
        const listener = result as { event?: unknown; listener?: unknown; off?: () => void };
        return { event: listener.event, listener: listener.listener, off: () => listener.off?.() };
      }
      return result;
    };

    const proxy = new Proxy({} as PluginContext['events'], {
      get(_stub, property) {
        if (typeof property !== 'string') {
          return undefined;
        }

        const permission = EVENT_METHOD_PERMISSIONS.get(property);
        if (!permission) {
          throw new Error(
            `Plugin "${pluginName}" attempted to use "events.${property}", which the plugin sandbox does not expose.`,
          );
        }

        const emitter = base.events;
        const original = Reflect.get(emitter, property, emitter);
        if (typeof original !== 'function') {
          return undefined;
        }

        return (...args: unknown[]) => {
          require(permission, `events.${property}`);
          return sanitize(emitter, (original as (...a: unknown[]) => unknown).apply(emitter, args));
        };
      },
    });

    holder.proxy = proxy as PluginContext['events'];
    return holder.proxy;
  }
}

interface LegacyPluginSandboxPluginGuardedContextContext {
  guardEvents: (typeof LegacyPluginSandbox)['guardEvents'];
  assertRepositoryPermission: (typeof LegacyPluginSandbox)['assertRepositoryPermission'];
}
function createGuardedContextImplementation(
  context: LegacyPluginSandboxPluginGuardedContextContext,
  base: PluginContext,
  declared: PluginPermission[],
): PluginContext {
  const pluginName = base.manifest.name;
  const granted = new Set(declared);

  const require = (permission: PluginPermission, capability: string): void => {
    if (!granted.has(permission)) {
      throw new PluginPermissionError(pluginName, capability, permission);
    }
  };

  const guardedEvents = context.guardEvents(base, pluginName, require);

  return {
    manifest: base.manifest,
    audit: base.audit,
    liveUpdates: base.liveUpdates,
    logger: base.logger,
    mqtt: {
      subscribe(serverId, topicFilter, handler) {
        require(PluginPermission.ACCESS_MQTT_SERVERS, `mqtt.subscribe(${serverId}, ${topicFilter})`);
        return base.mqtt.subscribe(serverId, topicFilter, handler);
      },
      publish(serverId, topic, payload, options) {
        require(PluginPermission.ACCESS_MQTT_SERVERS, `mqtt.publish(${serverId}, ${topic})`);
        return base.mqtt.publish(serverId, topic, payload, options);
      },
      refreshConnection(serverId) {
        require(PluginPermission.ACCESS_MQTT_SERVERS, `mqtt.refreshConnection(${serverId})`);
        if (!base.mqtt.refreshConnection) throw new Error('MQTT connection refresh is unavailable in this host');
        return base.mqtt.refreshConnection(serverId);
      },
    },
    events: guardedEvents,
    get dataSource() {
      require(PluginPermission.DATABASE_ACCESS, 'dataSource');
      return base.dataSource;
    },
    getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>) {
      context.assertRepositoryPermission(base, declared, entity);
      return base.getRepository(entity);
    },
    get<T>(token: Type<T> | string | symbol): T {
      require(PluginPermission.RESOLVE_HOST_PROVIDERS, `get(${String(token)})`);
      return base.get<T>(token);
    },
    onEvent<E extends SystemEvent>(event: E, handler: SystemEventHandler<E>): SystemEventSubscription {
      require(PluginPermission.LISTEN_EVENTS, `onEvent(${event})`);
      return base.onEvent(event, handler);
    },
    emitEvent<E extends SystemEvent>(event: E, payload: SystemEventPayload[E]): void {
      require(PluginPermission.EMIT_EVENTS, `emitEvent(${event})`);
      base.emitEvent(event, payload);
    },
    getMqttServerConfig(serverId: number): Promise<MqttServerConnectionConfig | null> {
      require(PluginPermission.ACCESS_MQTT_SERVERS, `getMqttServerConfig(${serverId})`);
      return base.getMqttServerConfig(serverId);
    },
    getMqttCredentialProvisioning(): MqttCredentialProvisioningHostProvider {
      require(PluginPermission.ACCESS_MQTT_SERVERS, 'getMqttCredentialProvisioning()');
      return base.getMqttCredentialProvisioning();
    },
    get flows(): PluginFlowsContext {
      require(PluginPermission.TRIGGER_FLOWS, 'flows.trigger()');
      return base.flows;
    },
    get secrets(): PluginSecretsContext {
      require(PluginPermission.MANAGE_SECRETS, 'secrets');
      return base.secrets;
    },
  };
}
