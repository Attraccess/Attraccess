import { BillingItemAllocationSegment, ResourceMeteringSegment } from '@attraccess/database-entities';

import { formatMeterValue, meterCharge } from './quantity';
import { ExactSum, roundHalfUp, SegmentSplit, ShareParticipant, splitSegment } from './shared-allocation';

const SCALE = BigInt(1_000_000_000);

export type ClosedSegment = Pick<
  ResourceMeteringSegment,
  'id' | 'startedAt' | 'endedAt' | 'startValue' | 'endValue' | 'participants'
>;

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
    const instant = split.consumed === BigInt(0) && (segment.endedAt?.getTime() ?? 0) - segment.startedAt.getTime() < 1000;
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
