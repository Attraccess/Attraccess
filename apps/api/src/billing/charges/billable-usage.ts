/**
 * The part of a resource usage that billing reads: its time span, the prices frozen at its start and the owner's
 * billing factor. A stored usage satisfies it as it is; billing never needs the rest of the usage.
 */
export interface BillableUsage {
  id: number;
  userId?: number | null;
  startTime: Date;
  endTime?: Date | null;
  resource: { id: number };
  user: { billingFactor: number };
  sessionDurationCreditsPerMinute?: number | null;
  operatingDurationCreditsPerMinute?: number | null;
  creditsPerUsage?: number | null;
  billingFactor?: number | null;
  attributedOperatingDurationInMinutes?: number | null;
  meterRates?: ReadonlyArray<{ creditsPerUnit: number }> | null;
}

/** The prices frozen on a usage when it started, which decide whether and how much it bills. */
export type BillablePriceSnapshot = Pick<
  BillableUsage,
  'creditsPerUsage' | 'sessionDurationCreditsPerMinute' | 'operatingDurationCreditsPerMinute' | 'meterRates'
>;
