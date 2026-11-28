import { ProjectSwitchCharging } from '@attraccess/application-models';
import { applyPartBillingFactor } from '@attraccess/shared';
import type { ContinuedUsagePart } from '../ports/billing-ledger.port';
import type { BillableUsage } from './billable-usage';
import { roundsWithPreviousParts, usagePartCharges, type UsagePartRates } from './project-switch-charges';

const { CONTINUE, CONTINUE_PER_PART_ROUNDING: PER_PART, NEW_SESSION } = ProjectSwitchCharging;
const RATES: UsagePartRates = { creditsPerUsage: 10, creditsPerMinute: 2, creditsPerOperatingMinute: 3 };
const START = Date.parse('2026-03-01T10:00:00.000Z');
const MINUTE = 60_000;

interface Part {
  /** Session minutes of the part, fractions allowed. */
  minutes: number;
  /** Attributed operating minutes of the part. */
  operating?: number;
  mode?: ProjectSwitchCharging;
}

/** Bills a chain of parts one after the other, as the switches and the final stop settle them. */
function bill(parts: Part[], factor = 100, rates = RATES) {
  const settled: ContinuedUsagePart[] = [];
  let elapsedMs = 0;
  return parts.map((part, index) => {
    const startTime = new Date(START + elapsedMs);
    elapsedMs += Math.round(part.minutes * MINUTE);
    const mode = index === 0 ? null : (part.mode ?? CONTINUE);
    const usage: BillableUsage = {
      id: index + 1,
      resource: { id: 1 },
      user: { billingFactor: factor },
      startTime,
      endTime: new Date(START + elapsedMs),
      attributedOperatingDurationInMinutes: part.operating ?? 0,
      previousUsageId: index === 0 ? null : index,
      projectSwitchCharging: mode,
    };
    // What the ledger reads: newest first, down to the first part that rounded on its own.
    const previous: ContinuedUsagePart[] = [];
    if (roundsWithPreviousParts(usage)) {
      for (const earlier of [...settled].reverse()) {
        previous.push(earlier);
        if (earlier.projectSwitchCharging !== CONTINUE) break;
      }
    }
    const charges = usagePartCharges(usage, rates, previous);
    settled.push({
      startTime,
      attributedOperatingDurationInMinutes: part.operating ?? 0,
      projectSwitchCharging: mode,
    });
    const gross = BigInt(
      charges.flatCredits +
        charges.minutes * rates.creditsPerMinute +
        charges.operatingMinutes * rates.creditsPerOperatingMinute,
    );
    return { ...charges, total: applyPartBillingFactor(charges.priorCredits, gross, factor).amount };
  });
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe('charging the parts of a session whose project was switched', () => {
  const several: Part[] = [
    { minutes: 2.5, operating: 1.2 },
    { minutes: 0.2, operating: 0.1 },
    { minutes: 0.2 },
    { minutes: 3.05, operating: 2.75 },
    { minutes: 1, operating: 0.45 },
  ];
  const unsplit: Part[] = [
    { minutes: sum(several.map((p) => p.minutes)), operating: sum(several.map((p) => p.operating ?? 0)) },
  ];

  describe('continue (default)', () => {
    it('bills all parts together exactly like one unsplit session', () => {
      const parts = bill(several);
      const [whole] = bill(unsplit);

      expect(sum(parts.map((p) => p.minutes))).toBe(whole.minutes);
      expect(sum(parts.map((p) => p.operatingMinutes))).toBe(whole.operatingMinutes);
      expect(sum(parts.map((p) => p.flatCredits))).toBe(RATES.creditsPerUsage);
      expect(sum(parts.map((p) => p.total))).toBe(whole.total);
    });

    it('rounds minutes on cumulative boundaries from the first start', () => {
      expect(bill(several).map((p) => p.minutes)).toEqual([3, 0, 0, 3, 1]);
      expect(bill(several).map((p) => p.operatingMinutes)).toEqual([2, 0, 0, 3, 0]);
    });

    it.each([0, 33, 50, 75, 90, 100, 150])('keeps the sum with a billing factor of %i %%', (factor) => {
      for (const rates of [RATES, { creditsPerUsage: 1, creditsPerMinute: 1, creditsPerOperatingMinute: 1 }]) {
        expect(sum(bill(several, factor, rates).map((p) => p.total))).toBe(bill(unsplit, factor, rates)[0].total);
      }
    });

    it('never bills more or less than one session, whatever the switch times', () => {
      // A fixed pseudo random sequence of part lengths in milliseconds.
      let seed = 7;
      const next = (limit: number) => (seed = (seed * 48_271) % 2_147_483_647) % limit;
      for (let round = 0; round < 200; round++) {
        const parts: Part[] = Array.from({ length: 2 + next(5) }, () => ({
          minutes: next(200_000) / MINUTE,
          operating: next(90_000) / MINUTE,
        }));
        const whole = bill([
          { minutes: sum(parts.map((p) => p.minutes)), operating: sum(parts.map((p) => p.operating ?? 0)) },
        ])[0];
        expect(sum(bill(parts).map((p) => p.total))).toBe(whole.total);
      }
    });
  });

  it('continue-per-part-rounding bills one fee and rounds every part up on its own', () => {
    const parts = bill(several.map((part) => ({ ...part, mode: PER_PART })));

    expect(parts.map((p) => p.minutes)).toEqual([3, 1, 1, 4, 1]);
    expect(parts.map((p) => p.operatingMinutes)).toEqual([2, 1, 0, 3, 1]);
    expect(parts.map((p) => p.flatCredits)).toEqual([10, 0, 0, 0, 0]);
  });

  it('new-session bills every part like a session of its own', () => {
    const parts = bill(several.map((part) => ({ ...part, mode: NEW_SESSION })));

    expect(parts.map((p) => p.flatCredits)).toEqual([10, 10, 10, 10, 10]);
    expect(parts.map((p) => p.minutes)).toEqual([3, 1, 1, 4, 1]);
    expect(parts.map((p) => p.total)).toEqual(several.map((part) => bill([part])[0].total));
  });

  it('continues cumulatively from the latest part that was charged on its own when the setting changed', () => {
    const parts = bill([{ minutes: 1.5 }, { minutes: 1.5, mode: NEW_SESSION }, { minutes: 1.2 }, { minutes: 1.2 }]);

    // The third and fourth part continue the run the second started: 1.5 + 1.2 + 1.2 minutes are 4 started ones.
    expect(parts.map((p) => p.minutes)).toEqual([2, 2, 1, 1]);
    expect(parts.map((p) => p.flatCredits)).toEqual([10, 10, 0, 0]);
  });
});
