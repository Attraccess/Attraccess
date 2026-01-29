import { describe, expect, it } from 'vitest';
import { computeCalibrationRegression } from './positional-tracking.calibration';

describe('computeCalibrationRegression', () => {
  it('computes txPowerAt1m and path loss exponent from samples', () => {
    const txPowerAt1m = -50;
    const pathLossExponent = 2;
    const samples = [
      { distance: 1, samples: [txPowerAt1m] },
      { distance: 2, samples: [txPowerAt1m - 10 * pathLossExponent * Math.log10(2)] },
      { distance: 4, samples: [txPowerAt1m - 10 * pathLossExponent * Math.log10(4)] },
    ];

    const result = computeCalibrationRegression(samples);

    expect(result).not.toBeNull();
    if (!result) {
      return;
    }
    expect(result.txPowerAt1m).toBeCloseTo(txPowerAt1m, 3);
    expect(result.pathLossExponent).toBeCloseTo(pathLossExponent, 3);
    expect(result.sampleCount).toBe(3);
    expect(result.rmse).toBeLessThan(1e-6);
    expect(result.r2).toBeCloseTo(1, 6);
  });

  it('returns null for insufficient data', () => {
    expect(computeCalibrationRegression([{ distance: 1, samples: [] }])).toBeNull();
  });
});
