export type CalibrationSample = {
  distance: number;
  samples: number[];
};

export type CalibrationRegressionResult = {
  txPowerAt1m: number;
  pathLossExponent: number;
  sampleCount: number;
  rmse: number;
  r2: number;
};

type RegressionPoint = { x: number; y: number };

function buildPoints(samples: CalibrationSample[]): RegressionPoint[] {
  const points: RegressionPoint[] = [];
  for (const sample of samples) {
    if (!Number.isFinite(sample.distance) || sample.distance <= 0) {
      continue;
    }
    const x = Math.log10(sample.distance);
    for (const value of sample.samples) {
      if (Number.isFinite(value)) {
        points.push({ x, y: value });
      }
    }
  }
  return points;
}

export function computeCalibrationRegression(
  samples: CalibrationSample[],
): CalibrationRegressionResult | null {
  const points = buildPoints(samples);
  const count = points.length;
  if (count < 2) {
    return null;
  }

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumXX += point.x * point.x;
    sumXY += point.x * point.y;
  }
  const denominator = count * sumXX - sumX * sumX;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) {
    return null;
  }
  const slope = (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;

  const meanY = sumY / count;
  let sse = 0;
  let sst = 0;
  for (const point of points) {
    const predicted = intercept + slope * point.x;
    const error = point.y - predicted;
    sse += error * error;
    const diff = point.y - meanY;
    sst += diff * diff;
  }
  const rmse = Math.sqrt(sse / count);
  const r2 = sst > 0 ? 1 - sse / sst : 1;

  const pathLossExponent = -slope / 10;
  return {
    txPowerAt1m: intercept,
    pathLossExponent,
    sampleCount: count,
    rmse,
    r2,
  };
}
