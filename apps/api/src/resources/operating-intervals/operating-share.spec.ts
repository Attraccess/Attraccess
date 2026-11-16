import { computeOperatingShare, operatingBreakdown, ShareUsage } from './operating-share';

const at = (time: string) => new Date(`2026-06-01T${time}Z`);
const usage = (id: number, start: string, end: string | null, rate = 6): ShareUsage => ({
  id,
  startTime: at(start),
  endTime: end ? at(end) : null,
  operatingDurationCreditsPerMinute: rate,
});
const ended = (id: number, start: string, end: string, rate = 6) =>
  usage(id, start, end, rate) as ShareUsage & { endTime: Date };
const running = [{ startTime: at('10:00:00'), endTime: at('11:00:00') }];

describe('computeOperatingShare', () => {
  it('leaves a session that never overlapped another to the legacy minute rule', () => {
    const share = computeOperatingShare(ended(1, '10:10:00', '10:40:00'), [], running);

    expect(share).toMatchObject({ shared: false, shareMs: 30 * 60_000, credits: 180 });
  });

  it('splits the running time of a segment equally and charges exact time, not rounded minutes', () => {
    const a = ended(1, '10:00:00', '10:30:00');
    const b = ended(2, '10:15:00', '10:45:00');

    const forA = computeOperatingShare(a, [b], running);
    const forB = computeOperatingShare(b, [a], running);

    // 10:00-10:15 A alone (15 min), 10:15-10:30 together (15 / 2), 10:30-10:45 B alone (15)
    expect(forA).toMatchObject({ shared: true, shareMs: 22.5 * 60_000, credits: 135 });
    expect(forB).toMatchObject({ shared: true, shareMs: 22.5 * 60_000, credits: 135 });
    // Everyone's shares add up to the machine's running time times the rate: 45 minutes at 6 credits.
    expect(forA.credits + forB.credits).toBe(270);
  });

  it('adds the shares of every session up to the segment totals for mixed rates and remainders', () => {
    const sessions = [
      ended(1, '10:00:00', '10:20:01', 7),
      ended(2, '10:05:03', '10:20:01', 3),
      ended(3, '10:05:03', '10:30:00', 5),
    ];
    const shares = sessions.map((session) =>
      computeOperatingShare(
        session,
        sessions.filter((other) => other !== session),
        running,
      ),
    );

    sessions.forEach((_, index) => {
      shares[index].segments.forEach((segment) => {
        // Every session that shares a segment derives the same total, and the whole-credit shares add up to it.
        const credits = shares
          .map((share) =>
            share.segments.find(
              (s) =>
                s.startedAt.getTime() === segment.startedAt.getTime() &&
                s.endedAt.getTime() === segment.endedAt.getTime(),
            ),
          )
          .filter((s) => s !== undefined);
        expect(credits.every((s) => s?.totalCredits === segment.totalCredits)).toBe(true);
        expect(credits.reduce((sum, s) => sum + (s?.shareCredits ?? 0), 0)).toBe(segment.totalCredits);
      });
    });
  });

  it('shares with a session that is still running and with one whose end is in progress', () => {
    const target = ended(2, '10:20:00', '10:50:00');
    const earlier = usage(1, '10:00:00', null);

    const whileRunning = computeOperatingShare(target, [earlier], running);
    const whileEnding = computeOperatingShare(target, [earlier], running, new Map([[1, at('10:30:00')]]));

    expect(whileRunning.shareMs).toBe(15 * 60_000);
    // 10:20-10:30 together (5), 10:30-10:50 alone (20)
    expect(whileEnding.shareMs).toBe(25 * 60_000);
  });

  it('describes the segments for the receipt', () => {
    const a = ended(1, '10:00:00', '10:30:00');
    const b = ended(2, '10:15:00', '10:45:00');

    const [alone, together] = operatingBreakdown(computeOperatingShare(a, [b], running));

    expect(alone).toMatchObject({ participants: 1, totalQuantity: String(15 * 60_000), shareCredits: 90 });
    expect(together).toMatchObject({
      participants: 2,
      totalQuantity: String(15 * 60_000),
      shareQuantity: String(7.5 * 60_000),
      totalCredits: 90,
      shareCredits: 45,
    });
  });

  it('charges nothing for time the machine did not run', () => {
    const share = computeOperatingShare(ended(1, '12:00:00', '12:30:00'), [ended(2, '12:10:00', '12:20:00')], running);

    expect(share).toMatchObject({ shared: true, shareMs: 0, credits: 0, segments: [] });
  });
});
