import type { EntityTarget, ObjectLiteral } from '@attraccess/plugins-backend-sdk';
import {
  isPluginPermission,
  PluginContext,
  PluginPermission,
  PluginPermissionError,
} from '@attraccess/plugins-backend-sdk';
import { Injectable, Logger } from '@nestjs/common';
import { createGuardedContext as createGuardedContextImplementation } from './runtime/guarded-context';
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
export class PluginSandboxService {
  private static readonly logger = new Logger(PluginSandboxService.name);

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
            `Valid permissions are: ${Object.values(PluginPermission).join(', ')}.`,
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
