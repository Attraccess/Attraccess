import { ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { EntityManager, FindOptionsWhere, IsNull } from 'typeorm';

const publishedState = { usageAction: ResourceUsageAction.Usage, isFinalized: true, lifecyclePending: false };

/** Published, usable machine session. Reservations are protected by the lifecycle gate. */
export function activeUsageWhere(): FindOptionsWhere<ResourceUsage> {
  return { ...publishedState, endTime: IsNull() };
}

/** Select the published usage before resolving optional related records such as meter sessions. */
export function findActiveUsage(manager: EntityManager, resourceId: number): Promise<ResourceUsage | null> {
  return manager.findOne(ResourceUsage, {
    where: { resourceId, ...activeUsageWhere() },
    order: { startTime: 'DESC', id: 'DESC' },
  });
}

export function activeUsageSql(alias: string): string {
  return `${alias}.endTime IS NULL AND ${Object.entries(publishedState)
    .map(([column, value]) => `${alias}.${column} = ${typeof value === 'boolean' ? Number(value) : `'${value}'`}`)
    .join(' AND ')}`;
}
