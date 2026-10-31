import { Resource, ResourceType, ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { EntityManager, FindOptionsWhere, IsNull } from 'typeorm';

const publishedState = { usageAction: ResourceUsageAction.Usage, isFinalized: true, lifecyclePending: false };

/** Published, usable machine session. Reservations are protected by the lifecycle gate. */
export function activeUsageWhere(): FindOptionsWhere<ResourceUsage> {
  return { ...publishedState, endTime: IsNull() };
}

/** In-memory counterpart of {@link activeUsageWhere}, for usages that were loaded without that filter. */
export function isActiveUsage(usage: ResourceUsage): boolean {
  return (
    usage.endTime == null &&
    Object.entries(publishedState).every(([column, value]) => usage[column as keyof typeof publishedState] === value)
  );
}

/**
 * The session that owns metering: the only active one. With parallel sessions the earliest started
 * (interim rule, see ATT-1191); on a machine limited to one session, legacy duplicates resolve to the newest.
 * Select it before resolving optional related records such as meter sessions.
 */
export async function findActiveUsage(manager: EntityManager, resourceId: number): Promise<ResourceUsage | null> {
  const sessions = await manager.find(ResourceUsage, {
    where: { resourceId, ...activeUsageWhere() },
    order: { startTime: 'ASC', id: 'ASC' },
  });
  if (sessions.length <= 1) return sessions[0] ?? null;
  const resource = await manager.findOne(Resource, {
    where: { id: resourceId },
    select: { id: true, type: true, maxParallelSessions: true },
  });
  return resource && getSessionCapacity(resource, sessions.length).maxParallelSessions > 1
    ? sessions[0]
    : sessions[sessions.length - 1];
}

export function activeUsageSql(alias: string): string {
  return `${alias}.endTime IS NULL AND ${Object.entries(publishedState)
    .map(([column, value]) => `${alias}.${column} = ${typeof value === 'boolean' ? Number(value) : `'${value}'`}`)
    .join(' AND ')}`;
}

/** All published sessions of a machine, earliest first: the earliest session is the interim payer (ATT-1189). */
export function findActiveUsages(manager: EntityManager, resourceId: number): Promise<ResourceUsage[]> {
  return manager.find(ResourceUsage, {
    where: { resourceId, ...activeUsageWhere() },
    order: { startTime: 'ASC', id: 'ASC' },
  });
}

/** Published sessions plus pending starts occupy a slot. Supervisors never take one. */
export function countOccupiedSlots(manager: EntityManager, resourceId: number): Promise<number> {
  return manager
    .createQueryBuilder(ResourceUsage, 'usage')
    .where('usage.resourceId = :resourceId', { resourceId })
    .andWhere('usage.usageAction = :action', { action: ResourceUsageAction.Usage })
    .andWhere('usage.endTime IS NULL')
    .andWhere('(usage.isFinalized = 1 OR usage.lifecyclePending = 1)')
    .getCount();
}

/**
 * Without a usageId the caller's own session is ended, never somebody else's newest one. A single
 * remaining session may still be ended by an authorized user (force-stop at limit 1).
 */
export function pickSessionToEnd(sessions: ResourceUsage[], user: User, usageId?: number): ResourceUsage {
  if (usageId !== undefined) {
    const target = sessions.find((session) => session.id === usageId);
    if (!target) throw new BadRequestException('No active session found');
    return target;
  }
  if (sessions.length === 0) throw new BadRequestException('No active session found');
  // Newest first, so legacy duplicates of one person keep ending the newest one.
  const own = [...sessions].reverse().find((session) => session.userId === user.id);
  if (own) return own;
  if (sessions.length === 1) return sessions[0];
  throw new BadRequestException('Several sessions are active on this machine; specify the usageId to end');
}

/** Slot usage for display and gating. Doors always behave like a limit of 1. */
export function getSessionCapacity(
  resource: Pick<Resource, 'type' | 'maxParallelSessions'>,
  activeSessionCount: number,
): { activeSessionCount: number; maxParallelSessions: number; isFull: boolean } {
  const maxParallelSessions =
    resource.type === ResourceType.Machine ? Math.max(1, resource.maxParallelSessions ?? 1) : 1;
  return { activeSessionCount, maxParallelSessions, isFull: activeSessionCount >= maxParallelSessions };
}
