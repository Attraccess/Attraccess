export interface OperatingDurationSummary {
  operatingDataAvailable: boolean;
  isProvisional: boolean;
  attributions: Array<{ usageId: number; durationMs: number }>;
}

const MAX_OPERATING_DURATION_WINDOW_MS = 31 * 24 * 60 * 60_000;

export function operatingDurationWindows(start: Date, end: Date): Array<{ start: Date; end: Date }> {
  const windows: Array<{ start: Date; end: Date }> = [];
  let windowStart = start;

  while (windowStart < end) {
    const windowEnd = new Date(Math.min(windowStart.getTime() + MAX_OPERATING_DURATION_WINDOW_MS, end.getTime()));
    windows.push({ start: windowStart, end: windowEnd });
    windowStart = windowEnd;
  }

  return windows;
}

export function mergeOperatingDurationSummaries(
  target: Record<number, OperatingDurationSummary>,
  source: Record<number, OperatingDurationSummary>,
) {
  for (const [resourceId, summary] of Object.entries(source)) {
    const existing = target[Number(resourceId)];
    target[Number(resourceId)] = existing
      ? {
          operatingDataAvailable: existing.operatingDataAvailable || summary.operatingDataAvailable,
          isProvisional: existing.isProvisional || summary.isProvisional,
          attributions: [...existing.attributions, ...summary.attributions],
        }
      : summary;
  }
}

export function attributedDurationByResourceAndUsage(
  summaries: Record<number, OperatingDurationSummary> | undefined,
): Map<number, Map<number, number>> {
  const result = new Map<number, Map<number, number>>();

  for (const [resourceId, summary] of Object.entries(summaries ?? {})) {
    if (!summary.operatingDataAvailable) continue;

    const byUsage = new Map<number, number>();
    for (const attribution of summary.attributions) {
      byUsage.set(attribution.usageId, (byUsage.get(attribution.usageId) ?? 0) + attribution.durationMs);
    }
    result.set(Number(resourceId), byUsage);
  }

  return result;
}
