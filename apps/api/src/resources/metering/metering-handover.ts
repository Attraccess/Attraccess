import { randomUUID } from 'node:crypto';
import {
  type NewResourceMeteringSession,
  type ResourceMeteringSessionRecord,
  ResourceMeteringSessionStatus,
} from '@attraccess/application-models';

import type { meterDefinitionFromFlow } from './metering-definition';
import { MeteringOperationError } from './metering-readings';
import type { MeteringSegments } from './metering-segments';
import type { FinalCollection, MeterFinal } from './metering-settlement';
import type { MeteringStore } from './metering-store.port';

export interface MeterHandoverHooks {
  store: MeteringStore;
  segments: MeteringSegments;
  /** The final total of a session with a total of its own, with the collect node's retries. */
  collectOwn(session: ResourceMeteringSessionRecord, freshAfter: Date): Promise<MeterFinal>;
  getDefinition(resourceId: number, meterId: number): Promise<ReturnType<typeof meterDefinitionFromFlow>>;
}

const successorOf = (session: ResourceMeteringSessionRecord, usageId: number): NewResourceMeteringSession => ({
  id: randomUUID(),
  resourceId: session.resourceId,
  usageId,
  meterId: session.meterId,
  meterName: session.meterName,
  status: ResourceMeteringSessionStatus.Active,
  creditsPerUnit: session.creditsPerUnit,
  accounting: session.accounting,
  collectionMode: session.collectionMode,
  latestValue: '0',
});

/** Where the successor of a session with a total of its own starts counting, once the old total has been read. */
async function startingPoint(store: MeteringStore, session: ResourceMeteringSessionRecord) {
  // A measuring point of the session's own stands where the old session's total ended.
  if (session.accounting === 'per-session') {
    return (BigInt(session.baselineValue ?? '0') + BigInt(session.latestValue ?? '0')).toString();
  }
  if (session.collectionMode === 'increment') return session.baselineValue;
  const meter = await store.findMeterById(session.meterId);
  return meter?.counterValue ?? session.baselineValue;
}

/**
 * Splits the metering of a running usage between it and the usage that continues it after a project switch. The
 * switch is a boundary like a stop followed by a start, but the meter is only read, never initialized again: when
 * the switch is rolled back, the running session's measurement is as it was.
 *
 * Returns the final totals of the old usage. Throws when a billed meter cannot be read; the caller then discards
 * the successor.
 */
export async function handOverMeters(
  hooks: MeterHandoverHooks,
  usageId: number,
  successorUsageId: number,
  at: Date,
): Promise<FinalCollection> {
  const sessions = await hooks.store.findRunningSessionsOfUsage(usageId);
  if (!sessions.length) return { status: 'not-metered' };
  const meters: Record<string, MeterFinal> = {};
  for (const session of sessions) {
    const successor = successorOf(session, successorUsageId);
    let final: MeterFinal;
    if (session.accounting === 'segmented' && !session.compromisedReason) {
      final = await hooks.segments.handOver(
        session,
        successor,
        await hooks.getDefinition(session.resourceId, session.meterId),
        at,
        (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000)),
      );
    } else {
      final = await hooks.collectOwn(session, at);
    }
    // A compromised session cannot be billed whenever it ends, so it does not hold the switch back.
    if (final.status === 'unavailable' && session.creditsPerUnit > 0 && !session.compromisedReason) {
      throw new MeteringOperationError(`The meter "${session.meterName}" could not be read: ${final.reason}`);
    }
    meters[session.id] = final;
    if (session.accounting === 'segmented' && !session.compromisedReason) continue;
    // Read again: the reading just taken moved the old total.
    const read = (await hooks.store.findSession(session.id)) ?? session;
    const created = await hooks.store.createSession(successor);
    await hooks.store.updateSession(created.id, {
      baselineValue: await startingPoint(hooks.store, read),
      latestObservedAt: read.latestObservedAt,
      source: read.source,
      compromisedReason: read.compromisedReason,
    });
  }
  return { status: 'collected', meters };
}
