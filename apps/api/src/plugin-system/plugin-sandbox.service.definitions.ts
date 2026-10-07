import { Resource, Setting, User } from '@attraccess/database-entities';
import type { EntityTarget, ObjectLiteral } from '@attraccess/plugins-backend-sdk';
import { PluginContext, PluginPermission } from '@attraccess/plugins-backend-sdk';
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
