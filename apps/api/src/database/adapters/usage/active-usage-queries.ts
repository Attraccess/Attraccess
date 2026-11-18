import { Resource, ResourceUsage } from '@attraccess/database-entities';
import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import { EntityManager, FindOptionsWhere, IsNull } from 'typeorm';
import { publishedState } from '../../../resources/usage/sessions/published-state';

/** Published, usable machine session. Reservations are protected by the lifecycle gate. */
export function activeUsageWhere(): FindOptionsWhere<ResourceUsage> {
  return { ...publishedState, endTime: IsNull() };
}

/**
 * SQL condition (QueryBuilder property paths) of a published, usable session on the usage table under `alias`.
 * PostgreSQL has real booleans, so they are written as `true` / `false` (the legacy SQLite helper in
 * resources/usage/sessions/active-usage emits 0/1 for the released SQLite migration and must not be used here).
 */
export function activeUsageSql(alias: string): string {
  return `${alias}.endTime IS NULL AND ${Object.entries(publishedState)
    .map(([column, value]) => `${alias}.${column} = ${typeof value === 'boolean' ? String(value) : `'${value}'`}`)
    .join(' AND ')}`;
}

/** All published sessions of a machine, earliest first. */
export function findActiveUsages(manager: EntityManager, resourceId: number): Promise<ResourceUsage[]> {
  return manager.find(ResourceUsage, {
    where: { resourceId, ...activeUsageWhere() },
    order: { startTime: 'ASC', id: 'ASC' },
  });
}

/**
 * The machine's one active session. With parallel sessions the earliest started; on a machine limited to one
 * session, legacy duplicates resolve to the newest. Select it before resolving optional related records such as
 * meter sessions.
 */
export async function findActiveUsage(manager: EntityManager, resourceId: number): Promise<ResourceUsage | null> {
  const sessions = await findActiveUsages(manager, resourceId);
  if (sessions.length <= 1) return sessions[0] ?? null;
  const resource = await manager.findOne(Resource, {
    where: { id: resourceId },
    select: { id: true, type: true, maxParallelSessions: true },
  });
  // Doors and unknown resources behave like a limit of 1.
  const parallel = resource?.type === ResourceType.Machine ? Math.max(1, resource.maxParallelSessions ?? 1) : 1;
  return parallel > 1 ? sessions[0] : sessions[sessions.length - 1];
}

function occupiedSlotsQuery(manager: EntityManager, resourceId: number) {
  return manager
    .createQueryBuilder(ResourceUsage, 'usage')
    .where('usage.resourceId = :resourceId', { resourceId })
    .andWhere('usage.usageAction = :action', { action: ResourceUsageAction.Usage })
    .andWhere('usage.endTime IS NULL')
    .andWhere('(usage.isFinalized = true OR usage.lifecyclePending = true)');
}

/** Published sessions plus pending starts occupy a slot. Supervisors never take one. */
export function countOccupiedSlots(manager: EntityManager, resourceId: number): Promise<number> {
  return occupiedSlotsQuery(manager, resourceId).getCount();
}

/** The users behind {@link countOccupiedSlots}, one entry per occupied slot. */
export async function findOccupyingUserIds(manager: EntityManager, resourceId: number): Promise<number[]> {
  const rows = await occupiedSlotsQuery(manager, resourceId).select('usage.userId', 'userId').getRawMany();
  return rows.map((row: { userId: number }) => Number(row.userId));
}
