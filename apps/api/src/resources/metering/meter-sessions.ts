import { EntityManager, In } from 'typeorm';
import {
  Resource,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
} from '@attraccess/database-entities';
import { findActiveUsages, getSessionCapacity } from '../usage/sessions/active-usage';

/** Effective parallel session limit for metering. Doors and unknown resources behave like a limit of 1. */
export async function getMeteringSessionLimit(manager: EntityManager, resourceId: number): Promise<number> {
  const resource = await manager.findOne(Resource, {
    where: { id: resourceId },
    select: { id: true, type: true, maxParallelSessions: true },
  });
  return resource ? getSessionCapacity(resource, 0).maxParallelSessions : 1;
}

/** A running session of a machine and its open meter session for one meter, if it has one. */
export interface ActiveMeterSession {
  usage: ResourceUsage;
  session: ResourceMeteringSession | null;
}

/**
 * Every published session of the machine with its open meter session for each meter, earliest started first.
 * Several sessions can use a meter at once: how their consumption is told apart depends on the meter's allocation,
 * not on who started first.
 */
export async function findActiveMeterSessions(
  manager: EntityManager,
  resourceId: number,
  meterIds: number[],
): Promise<{ usages: ResourceUsage[]; byMeter: Map<number, ActiveMeterSession[]> }> {
  const published = await findActiveUsages(manager, resourceId);
  // A machine limited to one session counts only its newest session, as legacy duplicates always did.
  const usages =
    published.length > 1 && (await getMeteringSessionLimit(manager, resourceId)) <= 1 ? published.slice(-1) : published;
  const sessions =
    usages.length && meterIds.length
      ? await manager.find(ResourceMeteringSession, {
          where: {
            resourceId,
            usageId: In(usages.map((usage) => usage.id)),
            meterId: In(meterIds),
            status: ResourceMeteringSessionStatus.Active,
          },
        })
      : [];
  const byMeter = new Map<number, ActiveMeterSession[]>();
  for (const meterId of meterIds) {
    byMeter.set(
      meterId,
      usages.map((usage) => ({
        usage,
        session: sessions.find((session) => session.meterId === meterId && session.usageId === usage.id) ?? null,
      })),
    );
  }
  return { usages, byMeter };
}
