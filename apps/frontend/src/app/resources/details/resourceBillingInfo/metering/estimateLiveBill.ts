import { applyPartBillingFactor, toExactCredits } from '@attraccess/shared';
import type { ResourceUsage, RunningPartBilling } from '@attraccess/react-query-client';

const MINUTE_MS = 60_000;

interface LiveBillInput {
  usage: Pick<ResourceUsage, 'startTime' | 'sessionDurationCreditsPerMinute' | 'billingFactor'>;
  pricing: Pick<RunningPartBilling, 'flatCredits' | 'priorCredits'> & { roundingStartTime: string | Date };
  elapsedMs: number;
  meters: { chargeCredits?: number | null }[];
}

/**
 * What the running record would be billed if it ended now, rounded like the server does. Null when the figures cannot
 * be charged exactly: a running estimate must not crash the resource page or show an imprecise charge.
 */
export function estimateLiveBill({ usage, pricing, elapsedMs, meters }: LiveBillInput): number | null {
  try {
    const roundingStart = new Date(pricing.roundingStartTime).getTime();
    const startedMinutes = (ms: number) => Math.ceil(Math.max(0, ms - roundingStart) / MINUTE_MS);
    const partStart = new Date(usage.startTime).getTime();
    // Minutes the earlier parts of the same rounding already started are theirs.
    const minutes = startedMinutes(partStart + elapsedMs) - startedMinutes(partStart);
    const gross =
      toExactCredits(pricing.flatCredits) +
      toExactCredits(usage.sessionDurationCreditsPerMinute ?? 0) * toExactCredits(minutes) +
      meters.reduce((sum, meter) => sum + toExactCredits(meter.chargeCredits ?? 0), BigInt(0));
    return applyPartBillingFactor(toExactCredits(pricing.priorCredits), gross, usage.billingFactor ?? 100).amount;
  } catch {
    return null;
  }
}
