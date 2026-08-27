import { Injectable, Logger, Type } from '@nestjs/common';
import { Resource, Setting, User } from '@attraccess/database-entities';
import {
  isPluginPermission,
  MqttServerConnectionConfig,
  MqttCredentialProvisioningHostProvider,
  PluginContext,
  PluginFlowsContext,
  PluginPermission,
  PluginPermissionError,
  SystemEvent,
  SystemEventHandler,
  SystemEventPayload,
  SystemEventSubscription,
} from '@attraccess/plugins-backend-sdk';
import type { EntityTarget, ObjectLiteral } from '@attraccess/plugins-backend-sdk';

const EVENT_METHOD_PERMISSIONS = new Map<string, PluginPermission>([
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

const ENTITY_PERMISSIONS: Array<{ target: EntityTarget<ObjectLiteral>; permission: PluginPermission }> = [
  { target: User, permission: PluginPermission.READ_USERS },
  { target: Resource, permission: PluginPermission.ACCESS_RESOURCES },
  { target: Setting, permission: PluginPermission.READ_SETTINGS },
];

function entityLabel<T extends ObjectLiteral>(entity: EntityTarget<T>): string {
  if (typeof entity === 'string') {
    return entity;
  }
  if (typeof entity === 'function') {
    return entity.name;
  }
  const named = entity as { name?: string; options?: { name?: string } };
  return named.options?.name ?? named.name ?? 'UnknownEntity';
}

function permissionForEntity<T extends ObjectLiteral>(base: PluginContext, entity: EntityTarget<T>): PluginPermission {
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
export class PluginSandboxService {
  private static readonly logger = new Logger(PluginSandboxService.name);

  /**
   * Validates the permissions declared in a manifest. Returns the parsed set or
   * throws guidance on the first unknown value.
   */
  public static validateDeclaredPermissions(pluginName: string, declared: unknown): PluginPermission[] {
    if (declared === undefined || declared === null) {
      return [];
    }

    if (!Array.isArray(declared)) {
      throw new Error(`Plugin "${pluginName}" manifest field "permissions" must be an array of strings.`);
    }

    const result: PluginPermission[] = [];
    for (const value of declared) {
      if (typeof value !== 'string' || !isPluginPermission(value)) {
        throw new Error(
          `Plugin "${pluginName}" declares unknown permission "${String(value)}". ` +
            `Valid permissions are: ${Object.values(PluginPermission).join(', ')}.`
        );
      }
      if (!result.includes(value)) {
        result.push(value);
      }
    }

    return result;
  }

  /**
   * Wraps a raw PluginContext so every host capability is gated by the plugin's
   * declared permissions. Accessing an undeclared capability throws a
   * PluginPermissionError naming the missing permission. The wrapper is
   * deny-by-default: only explicitly modelled capabilities are reachable.
   */
  public static createGuardedContext(base: PluginContext, declared: PluginPermission[]): PluginContext {
    const pluginName = base.manifest.name;
    const granted = new Set(declared);

    const require = (permission: PluginPermission, capability: string): void => {
      if (!granted.has(permission)) {
        throw new PluginPermissionError(pluginName, capability, permission);
      }
    };

    const guardedEvents = PluginSandboxService.guardEvents(base, pluginName, require);

    return {
      manifest: base.manifest,
      logger: base.logger,
      events: guardedEvents,
      get dataSource() {
        require(PluginPermission.DATABASE_ACCESS, 'dataSource');
        return base.dataSource;
      },
      getRepository<T extends ObjectLiteral>(entity: EntityTarget<T>) {
        const permission = permissionForEntity(base, entity);
        require(permission, `getRepository(${entityLabel(entity)})`);
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
    };
  }

  private static guardEvents(
    base: PluginContext,
    pluginName: string,
    require: (permission: PluginPermission, capability: string) => void
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
            `Plugin "${pluginName}" attempted to use "events.${property}", which the plugin sandbox does not expose.`
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
