import { BillingItemAllocationSegment } from '@attraccess/database-entities';

import { ExactSum, roundHalfUp, ShareParticipant, splitSegment } from '../metering/shared-allocation';

const MINUTE_MS = BigInt(60_000);

export interface ShareUsage {
  id: number;
  startTime: Date;
  endTime: Date | null;
  operatingDurationCreditsPerMinute: number | null;
}

export interface ShareInterval {
  startTime: Date;
  endTime: Date | null;
}

export interface OperatingShareSegment {
  startedAt: Date;
  endedAt: Date;
  participants: ShareParticipant[];
  /** Running time inside the segment, whole milliseconds. */
  operatingMs: number;
  /** The segment's credit total and this session's whole credits of it. */
  totalCredits: number;
  shareCredits: number;
}

export interface OperatingShare {
  /** Whether the session shared at least one segment. Sessions that did not are billed on the legacy minute rule. */
  shared: boolean;
  segments: OperatingShareSegment[];
  /** This session's share of the running time, whole milliseconds (rounded half-up once over all segments). */
  shareMs: number;
  /** This session's credits: the sum of its whole-credit segment shares. */
  credits: number;
}

function merged(intervals: ShareInterval[], from: number, to: number): [number, number][] {
  const clipped = intervals
    .map((interval) => [
      Math.max(interval.startTime.getTime(), from),
      Math.min(interval.endTime ? interval.endTime.getTime() : to, to),
    ])
    .filter(([start, end]) => start < end)
    .sort((left, right) => left[0] - right[0]);
  const union: [number, number][] = [];
  for (const [start, end] of clipped) {
    const last = union[union.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else union.push([start, end]);
  }
  return union;
}

function overlap(union: [number, number][], from: number, to: number): number {
  let total = 0;
  for (const [start, end] of union) {
    const clippedStart = Math.max(start, from);
    const clippedEnd = Math.min(end, to);
    if (clippedStart < clippedEnd) total += clippedEnd - clippedStart;
  }
  return total;
}

/**
 * Splits the running time of one session's span equally among the sessions active at the same time. Every start
 * and end of a session on the machine closes a segment; the running time inside it (the intersection of the
 * operating intervals with the segment) is split equally among the sessions active in it. All sessions that share a
 * segment derive the same segment total, so the charged shares always add up. `pendingEnds` are ends already
 * requested but not yet stored.
 */
export function computeOperatingShare(
  target: ShareUsage & { endTime: Date },
  others: ShareUsage[],
  intervals: ShareInterval[],
  pendingEnds: Map<number, Date> = new Map(),
): OperatingShare {
  const from = target.startTime.getTime();
  const to = target.endTime.getTime();
  const endOf = (usage: ShareUsage) => {
    const pending = usage.endTime ? undefined : pendingEnds.get(usage.id);
    const end = usage.endTime ?? pending;
    return end ? end.getTime() : Infinity;
  };
  const rivals = others.filter(
    (usage) => usage.id !== target.id && usage.startTime.getTime() < to && endOf(usage) > from,
  );
  const points = new Set<number>([from, to]);
  for (const usage of rivals) {
    for (const point of [usage.startTime.getTime(), endOf(usage)]) if (point > from && point < to) points.add(point);
  }
  const ordered = [...points].sort((left, right) => left - right);
  const running = merged(intervals, from, to);
  const rateOf = (usage: ShareUsage) => usage.operatingDurationCreditsPerMinute ?? 0;
  const segments: OperatingShareSegment[] = [];
  const shareMs = new ExactSum();
  let credits = 0;
  let shared = false;
  for (let index = 0; index + 1 < ordered.length; index++) {
    const [start, end] = [ordered[index], ordered[index + 1]];
    const participants: ShareParticipant[] = [target, ...rivals]
      .filter((usage) => usage.id === target.id || (usage.startTime.getTime() <= start && endOf(usage) >= end))
      .map((usage) => ({ usageId: usage.id, rate: rateOf(usage), startedAt: usage.startTime.getTime() }));
    if (participants.length > 1) shared = true;
    const operatingMs = overlap(running, start, end);
    if (operatingMs === 0) continue;
    const split = splitSegment(BigInt(operatingMs), MINUTE_MS, participants);
    const shareCredits = split.credits.get(target.id) ?? 0;
    credits += shareCredits;
    shareMs.add(BigInt(operatingMs), BigInt(participants.length));
    segments.push({
      startedAt: new Date(start),
      endedAt: new Date(end),
      participants,
      operatingMs,
      totalCredits: split.totalCredits,
      shareCredits,
    });
  }
  return { shared, segments, shareMs: Number(shareMs.rounded()), credits };
}

/** The segments a person was in with others, as shown on receipts. */
export function operatingBreakdown(share: OperatingShare): BillingItemAllocationSegment[] {
  return share.segments.map((segment) => ({
    startedAt: segment.startedAt.toISOString(),
    endedAt: segment.endedAt.toISOString(),
    participants: segment.participants.length,
    totalQuantity: String(segment.operatingMs),
    totalCredits: segment.totalCredits,
    shareQuantity: roundHalfUp(BigInt(segment.operatingMs), BigInt(segment.participants.length)).toString(),
    shareCredits: segment.shareCredits,
  }));
}
