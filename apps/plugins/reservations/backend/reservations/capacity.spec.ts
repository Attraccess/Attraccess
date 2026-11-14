import { ResourceType } from '@attraccess/plugins-backend-sdk';
import {
  type CapacityBooking,
  exceedsCapacity,
  heldBookings,
  peakConcurrency,
  selectExcessBookings,
  sessionLimitOf,
} from './capacity';

const HOUR = 3_600_000;
const T0 = Date.parse('2026-06-02T08:00:00Z');
const span = (fromH: number, toH: number) => ({ start: new Date(T0 + fromH * HOUR), end: new Date(T0 + toH * HOUR) });

let nextId = 1;
const booking = (
  userId: number,
  fromH: number,
  toH: number,
  patch: Partial<CapacityBooking> = {},
): CapacityBooking => ({
  id: nextId++,
  userId,
  startTime: new Date(T0 + fromH * HOUR),
  endTime: new Date(T0 + toH * HOUR),
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  createdAt: new Date(T0 - 1_000_000 + nextId * 1000),
  ...patch,
});

describe('capacity rules', () => {
  beforeEach(() => {
    nextId = 1;
  });

  it('derives the effective limit like core: machines only, minimum 1', () => {
    expect(sessionLimitOf({ type: ResourceType.Machine, maxParallelSessions: 3 })).toBe(3);
    expect(sessionLimitOf({ type: ResourceType.Machine, maxParallelSessions: 0 })).toBe(1);
    expect(sessionLimitOf({ type: ResourceType.Door, maxParallelSessions: 5 })).toBe(1);
    expect(sessionLimitOf(null)).toBe(1);
  });

  describe('concurrency sweep', () => {
    it('counts bookings that do not overlap each other as one', () => {
      expect(peakConcurrency([span(0, 1), span(1, 2), span(3, 4)], span(0, 5))).toBe(1);
      expect(exceedsCapacity([span(0, 1), span(1, 2), span(3, 4)], span(0, 5), 2)).toBe(false);
    });

    it('rejects when all slots are used at some instant inside the new span', () => {
      const existing = [span(0, 2), span(1, 3)];
      expect(peakConcurrency(existing, span(0, 3))).toBe(2);
      expect(exceedsCapacity(existing, span(1, 2), 2)).toBe(true);
      expect(exceedsCapacity(existing, span(2, 3), 2)).toBe(false);
      expect(exceedsCapacity(existing, span(3, 4), 2)).toBe(false);
    });

    it('treats spans as half-open and ignores the parts outside the window', () => {
      expect(peakConcurrency([span(0, 1), span(1, 2)], span(0, 2))).toBe(1);
      expect(peakConcurrency([span(-5, 0)], span(0, 1))).toBe(0);
    });
  });

  describe('held bookings', () => {
    const at = new Date(T0 + 0.5 * HOUR);
    it('holds a slot for other users running at the instant, once per person', () => {
      const confirmed = [booking(1, 0, 2), booking(2, 0, 1), booking(2, 0, 3), booking(3, 1, 2), booking(4, -2, 0)];
      const held = heldBookings({ confirmed, starterId: 9, inSession: new Set(), at });
      expect(held.map((b) => b.userId).sort()).toEqual([1, 2]);
    });

    it('skips the starter, holders in session and overridden bookings, and orders by end time', () => {
      const own = booking(9, 0, 2);
      const inSession = booking(1, 0, 2);
      const overridden = booking(2, 0, 2);
      const first = booking(3, 0, 1);
      const second = booking(4, 0, 2);
      const held = heldBookings({
        confirmed: [own, inSession, overridden, second, first],
        starterId: 9,
        inSession: new Set([1]),
        overridden: new Set([overridden.id]),
        at,
      });
      expect(held).toEqual([first, second]);
    });
  });

  describe('excess bookings after a lowered limit', () => {
    const now = new Date(T0);
    it('cancels the most recently created not-started booking first until every instant fits', () => {
      const a = booking(1, 1, 3, { createdAt: new Date(T0 - 3 * HOUR) });
      const b = booking(2, 1, 3, { createdAt: new Date(T0 - 2 * HOUR) });
      const c = booking(3, 1, 3, { createdAt: new Date(T0 - 1 * HOUR) });
      expect(selectExcessBookings([a, b, c], 2, now)).toEqual([c]);
      expect(selectExcessBookings([a, b, c], 1, now)).toEqual([c, b]);
      expect(selectExcessBookings([a, b, c], 3, now)).toEqual([]);
    });

    it('breaks creation ties by the higher id', () => {
      const created = new Date(T0 - HOUR);
      const a = booking(1, 1, 3, { createdAt: created });
      const b = booking(2, 1, 3, { createdAt: created });
      expect(selectExcessBookings([a, b], 1, now)).toEqual([b]);
    });

    it('never cancels running bookings and leaves instants only they overfill', () => {
      const running1 = booking(1, -1, 2);
      const running2 = booking(2, -1, 2);
      const future = booking(3, 1, 3);
      expect(selectExcessBookings([running1, running2, future], 1, now)).toEqual([future]);
      expect(selectExcessBookings([running1, running2], 1, now)).toEqual([]);
    });

    it('only cancels as many as needed when bookings do not overlap each other', () => {
      const a = booking(1, 1, 2);
      const b = booking(2, 3, 4);
      const c = booking(3, 1, 4);
      // limit 1: c overlaps both a and b; cancelling c (newest) fits everything
      expect(selectExcessBookings([a, b, c], 1, now)).toEqual([c]);
    });

    it('counts buffers in the blocked spans', () => {
      const a = booking(1, 1, 2);
      const b = booking(2, 2, 3);
      expect(selectExcessBookings([a, b], 1, now)).toEqual([]);
      expect(selectExcessBookings([{ ...a, bufferAfterMinutes: 30 }, b], 1, now)).toEqual([b]);
      expect(selectExcessBookings([a, { ...b, bufferBeforeMinutes: 30 }], 1, now)).toEqual([
        { ...b, bufferBeforeMinutes: 30 },
      ]);
    });
  });
});
