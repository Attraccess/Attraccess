import {
  BillingItemAllocationSegment,
  BillingTransactionItem,
  ResourceMeteringSegment,
  ResourceUsage,
} from '@attraccess/database-entities';
import { EntityManager, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';

import { formatMeterValue, meterCharge } from './quantity';
import { ExactSum, roundHalfUp, SegmentSplit, ShareParticipant, splitSegment } from './shared-allocation';

const SCALE = BigInt(1_000_000_000);

/** Segment boundaries carry the device's observation time, which may run somewhat ahead of or behind ours. */
const BOUNDARY_SKEW_MS = 60_000;

/**
 * A pending share that will never be charged (the session failed or was waived) no longer says it is charged
 * later: its line reads like any meter line without a final reading. Only display data of the item changes.
 */
export async function clearPendingShareMarkers(manager: EntityManager, sessionIds: string[]): Promise<void> {
  if (!sessionIds.length) return;
  await manager.update(
    BillingTransactionItem,
    { externalReference: In(sessionIds.map((id) => `metering:${id}:unavailable`)) },
    { allocation: null },
  );
}

export type ClosedSegment = Pick<
  ResourceMeteringSegment,
  'id' | 'startedAt' | 'endedAt' | 'startValue' | 'endValue' | 'participants'
>;

/**
 * The segments of a meter a usage took part in, oldest first: closed and abandoned ones that ended during or after
 * the usage and began before it ended, and the open one. Bounded by the usage's time, so it does not read the
 * meter's whole history.
 */
export async function findUsageSegments(
  manager: EntityManager,
  meterId: number,
  usage: Pick<ResourceUsage, 'id' | 'startTime' | 'endTime'>,
): Promise<ResourceMeteringSegment[]> {
  // Bounds are widened by the clock skew; segments of other sessions found that way are filtered out below.
  const ended = {
    meterId,
    endedAt: MoreThanOrEqual(new Date(usage.startTime.getTime() - BOUNDARY_SKEW_MS)),
    ...(usage.endTime ? { startedAt: LessThanOrEqual(new Date(usage.endTime.getTime() + BOUNDARY_SKEW_MS)) } : {}),
  };
  const segments = await manager.find(ResourceMeteringSegment, {
    where: [ended, { meterId, status: 'open' }],
    order: { startedAt: 'ASC' },
  });
  return segments.filter((segment) => segment.participants.some((participant) => participant.usageId === usage.id));
}

/** What the meter counted between a closed segment's boundary readings. Never negative. */
export function segmentConsumption(segment: Pick<ClosedSegment, 'startValue' | 'endValue'>): bigint {
  const consumed = BigInt(segment.endValue ?? segment.startValue) - BigInt(segment.startValue);
  return consumed > BigInt(0) ? consumed : BigInt(0);
}

/** Participants are stored earliest started first, so their position stands for their start in a tie. */
function shareParticipants(segment: ClosedSegment): ShareParticipant[] {
  return segment.participants.map((participant, index) => ({
    usageId: participant.usageId,
    rate: participant.creditsPerUnit,
    startedAt: index,
  }));
}

export function splitClosedSegment(segment: ClosedSegment): SegmentSplit & { consumed: bigint } {
  const consumed = segmentConsumption(segment);
  return { ...splitSegment(consumed, SCALE, shareParticipants(segment)), consumed };
}

export interface SessionShare {
  /** The session never shared a segment: it is billed exactly like a single session, on its whole total. */
  solo: boolean;
  /** The session's quantity: its whole total when solo, otherwise its share, rounded half-up once. */
  quantity: bigint;
  credits: number;
  /** Every segment the session took part in. */
  breakdown: BillingItemAllocationSegment[];
}

/** A session's quantity and whole credits over the closed segments it took part in. */
export function sessionShare(segments: ClosedSegment[], usageId: number): SessionShare {
  const mine = segments.filter((segment) => segment.participants.some((p) => p.usageId === usageId));
  if (mine.every((segment) => segment.participants.length === 1)) {
    const consumed = mine.reduce((total, segment) => total + segmentConsumption(segment), BigInt(0));
    const rate = mine.at(-1)?.participants[0].creditsPerUnit ?? 0;
    return { solo: true, quantity: consumed, credits: meterCharge(consumed, rate), breakdown: [] };
  }
  const quantity = new ExactSum();
  let credits = 0;
  const breakdown: BillingItemAllocationSegment[] = [];
  for (const segment of mine) {
    const split = splitClosedSegment(segment);
    const count = BigInt(segment.participants.length);
    const shareCredits = split.credits.get(usageId) ?? 0;
    credits += shareCredits;
    quantity.add(split.consumed, count);
    // A boundary that opened and closed at once (a takeover) is not worth a line on the receipt.
    const instant =
      split.consumed === BigInt(0) && (segment.endedAt?.getTime() ?? 0) - segment.startedAt.getTime() < 1000;
    if (!instant)
      breakdown.push({
        startedAt: segment.startedAt.toISOString(),
        endedAt: (segment.endedAt ?? segment.startedAt).toISOString(),
        participants: segment.participants.length,
        totalQuantity: formatMeterValue(split.consumed),
        totalCredits: split.totalCredits,
        shareQuantity: formatMeterValue(roundHalfUp(split.consumed, count)),
        shareCredits,
      });
  }
  return { solo: false, quantity: quantity.rounded(), credits, breakdown };
}
