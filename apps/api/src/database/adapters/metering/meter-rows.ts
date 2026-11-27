import {
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringSegment,
  ResourceMeteringSession,
} from '@attraccess/database-entities';
import { EntityManager, IsNull } from 'typeorm';
import { MeterNameTakenError } from '../../../resources/metering/metering-store.port';
import { isUniqueViolation } from '../../persistence-errors';

/** The condition of an active meter: one that is not archived. Every query for active meters uses it. */
export const ACTIVE_METER = { archivedAt: IsNull() } as const;

/** The meters of a resource, oldest first; the active ones unless archived meters are asked for too. */
export function meterRows(
  manager: EntityManager,
  resourceId: number,
  includeArchived = false,
): Promise<ResourceMeter[]> {
  return manager.find(ResourceMeter, {
    where: { resourceId, ...(includeArchived ? {} : ACTIVE_METER) },
    order: { id: 'ASC' },
  });
}

export function activeMeterRows(manager: EntityManager): Promise<ResourceMeter[]> {
  return manager.find(ResourceMeter, { where: ACTIVE_METER });
}

/** A write that would give two active meters of a resource one name violates the partial unique index. */
async function guardName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new MeterNameTakenError();
    throw error;
  }
}

export async function insertMeterRow(manager: EntityManager, resourceId: number, name: string): Promise<ResourceMeter> {
  return guardName(async () => {
    const saved = await manager.save(ResourceMeter, { resourceId, name });
    return manager.findOneByOrFail(ResourceMeter, { id: saved.id });
  });
}

export async function updateMeterRow(
  manager: EntityManager,
  where: { id: number; resourceId?: number },
  patch: Partial<Pick<ResourceMeter, 'name' | 'archivedAt'>>,
): Promise<void> {
  await guardName(() => manager.update(ResourceMeter, where, patch));
}

/** FOR UPDATE: unlike the lock of a plain write, it also holds off new rows whose foreign key names the meter. */
export function lockedMeterRow(
  manager: EntityManager,
  resourceId: number,
  meterId: number,
): Promise<ResourceMeter | null> {
  return manager.findOne(ResourceMeter, { where: { id: meterId, resourceId }, lock: { mode: 'pessimistic_write' } });
}

export async function meterHasRecords(manager: EntityManager, meterId: number): Promise<boolean> {
  return (
    (await manager.existsBy(ResourceMeteringSession, { meterId })) ||
    (await manager.existsBy(ResourceMeteringOperation, { meterId })) ||
    (await manager.existsBy(ResourceMeteringSegment, { meterId }))
  );
}
