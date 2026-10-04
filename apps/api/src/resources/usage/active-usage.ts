import { ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { FindOptionsWhere, IsNull } from 'typeorm';

const publishedState = { usageAction: ResourceUsageAction.Usage, isFinalized: true, lifecyclePending: false };

/** Published, usable machine session. Reservations are protected by the lifecycle gate. */
export function activeUsageWhere(): FindOptionsWhere<ResourceUsage> {
  return { ...publishedState, endTime: IsNull() };
}

export function activeUsageSql(alias: string): string {
  return `${alias}.endTime IS NULL AND ${Object.entries(publishedState)
    .map(([column, value]) => `${alias}.${column} = ${typeof value === 'boolean' ? Number(value) : `'${value}'`}`)
    .join(' AND ')}`;
}
