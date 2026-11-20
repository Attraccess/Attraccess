import type { MeteringUsageRecord, ResourceMeteringSessionRecord } from '@attraccess/application-models';
import type { TransactionContext } from '../../database/transaction-context';
import type { MeteringStore } from './metering-store.port';

/** Effective parallel session limit for metering. Doors and unknown resources behave like a limit of 1. */
export function getMeteringSessionLimit(
  store: MeteringStore,
  resourceId: number,
  context?: TransactionContext,
): Promise<number> {
  return store.findSessionLimit(resourceId, context);
}

/** A running session of a machine and its open meter session for one meter, if it has one. */
export interface ActiveMeterSession {
  usage: MeteringUsageRecord;
  session: ResourceMeteringSessionRecord | null;
}

/**
 * Every published session of the machine with its open meter session for each meter, earliest started first.
 * Several sessions can use a meter at once: how their consumption is told apart depends on the meter's allocation,
 * not on who started first.
 */
export async function findActiveMeterSessions(
  store: MeteringStore,
  resourceId: number,
  meterIds: number[],
  context?: TransactionContext,
): Promise<{ usages: MeteringUsageRecord[]; byMeter: Map<number, ActiveMeterSession[]> }> {
  const published = await store.findRunningUsages(resourceId, context);
  // A machine limited to one session counts only its newest session, as legacy duplicates always did.
  const usages =
    published.length > 1 && (await getMeteringSessionLimit(store, resourceId, context)) <= 1
      ? published.slice(-1)
      : published;
  const sessions =
    usages.length && meterIds.length
      ? await store.findRunningSessions(
          resourceId,
          usages.map((usage) => usage.id),
          meterIds,
          context,
        )
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
