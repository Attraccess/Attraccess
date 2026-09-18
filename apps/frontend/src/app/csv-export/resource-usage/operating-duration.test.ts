import { describe, expect, it } from 'vitest';
import {
  attributedDurationByResourceAndUsage,
  combinedOperatingDurationStatus,
  mergeOperatingDurationSummaries,
  operatingDurationWindows,
  type OperatingDurationSummary,
} from './operating-duration';

describe('operatingDurationWindows', () => {
  it('splits long report ranges into requests no longer than 31 days', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-03-15T00:00:00.000Z');

    expect(operatingDurationWindows(start, end)).toEqual([
      { start, end: new Date('2026-02-01T00:00:00.000Z') },
      { start: new Date('2026-02-01T00:00:00.000Z'), end: new Date('2026-03-04T00:00:00.000Z') },
      { start: new Date('2026-03-04T00:00:00.000Z'), end },
    ]);
  });
});

describe('attributedDurationByResourceAndUsage', () => {
  it('merges window results and indexes totals by resource and usage', () => {
    const summaries: Record<number, OperatingDurationSummary> = {};
    mergeOperatingDurationSummaries(summaries, {
      1: {
        operatingDataAvailable: true,
        isProvisional: false,
        attributions: [{ usageId: 12, durationMs: 10 }],
      },
    });
    mergeOperatingDurationSummaries(summaries, {
      1: {
        operatingDataAvailable: true,
        isProvisional: true,
        attributions: [
          { usageId: 12, durationMs: 20 },
          { usageId: 13, durationMs: 30 },
        ],
      },
    });

    const durations = attributedDurationByResourceAndUsage(summaries);

    expect(durations.get(1)?.get(12)).toBe(30);
    expect(durations.get(1)?.get(13)).toBe(30);
  });
});

describe('combinedOperatingDurationStatus', () => {
  const labels = { provisional: 'Provisional', unavailable: 'Unavailable' };

  it('keeps provisional and unavailable independent', () => {
    expect(
      combinedOperatingDurationStatus({ operatingDataAvailable: true, isProvisional: false }, labels),
    ).toBe('');
    expect(
      combinedOperatingDurationStatus({ operatingDataAvailable: true, isProvisional: true }, labels),
    ).toBe('Provisional');
    expect(
      combinedOperatingDurationStatus({ operatingDataAvailable: false, isProvisional: false }, labels),
    ).toBe('Unavailable');
    expect(
      combinedOperatingDurationStatus({ operatingDataAvailable: false, isProvisional: true }, labels),
    ).toBe('Provisional; Unavailable');
  });

  it('returns empty for a missing summary', () => {
    expect(combinedOperatingDurationStatus(undefined, labels)).toBe('');
  });
});
