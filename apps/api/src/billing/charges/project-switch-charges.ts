import { ProjectSwitchCharging, type RunningPartBilling } from '@attraccess/application-models';
import { cumulativeStartedMinutes, startedMinutes } from '@attraccess/shared';
import type { ContinuedUsagePart } from '../ports/billing-ledger.port';
import type { BillableUsage } from './billable-usage';

const MINUTE_MS = 60_000;

/** Attribution originates from integer-millisecond intervals; remove only minute-storage float noise. */
const operatingMsOf = (minutes: number | null | undefined) => Math.round((minutes ?? 0) * MINUTE_MS);

export interface UsagePartRates {
  creditsPerUsage: number;
  creditsPerMinute: number;
  creditsPerOperatingMinute: number;
}

/** The part of a usage that decides how its time is billed. */
export type UsagePartTimes = Pick<
  BillableUsage,
  'startTime' | 'endTime' | 'previousUsageId' | 'projectSwitchCharging' | 'attributedOperatingDurationInMinutes'
>;

/** What one usage record bills for itself, whether it is a whole session or one part of a switched one. */
export interface UsagePartCharges {
  flatCredits: number;
  durationMs: number;
  minutes: number;
  operatingMs: number;
  operatingMinutes: number;
  /**
   * What the earlier parts of a cumulatively rounded run charged before the billing factor, every item included. The
   * billing factor is rounded on the running total too, so a switched session costs what an unsplit one does.
   */
  priorCredits: bigint;
}

/** A continuation in one of the continuing modes pays no further fee per use. */
const paysFlatFee = (mode: ProjectSwitchCharging | null | undefined) =>
  !mode || mode === ProjectSwitchCharging.NEW_SESSION;

/** Whether the part's minutes are rounded together with the parts before it, which then have to be read. */
export const roundsWithPreviousParts = (
  usage: Pick<UsagePartTimes, 'previousUsageId' | 'projectSwitchCharging'>,
): boolean => usage.projectSwitchCharging === ProjectSwitchCharging.CONTINUE && usage.previousUsageId != null;

/**
 * `previous` are the earlier parts the usage is rounded together with, newest first, down to the first one that
 * rounded on its own; it is empty for every other usage.
 */
export function usagePartCharges(
  usage: UsagePartTimes,
  rates: UsagePartRates,
  previous: ContinuedUsagePart[] = [],
): UsagePartCharges {
  const durationMs = usage.endTime ? Math.max(0, usage.endTime.getTime() - usage.startTime.getTime()) : 0;
  const operatingMs = operatingMsOf(usage.attributedOperatingDurationInMinutes);
  const flatCredits = paysFlatFee(usage.projectSwitchCharging) ? rates.creditsPerUsage : 0;
  const first = previous[previous.length - 1];
  if (!first) {
    return {
      flatCredits,
      durationMs,
      minutes: startedMinutes(durationMs),
      operatingMs,
      operatingMinutes: startedMinutes(operatingMs),
      priorCredits: BigInt(0),
    };
  }
  const elapsedBeforeMs = usage.startTime.getTime() - first.startTime.getTime();
  const priorOperatingMs = previous.reduce(
    (total, part) => total + operatingMsOf(part.attributedOperatingDurationInMinutes),
    0,
  );
  return {
    flatCredits,
    durationMs,
    minutes: cumulativeStartedMinutes(elapsedBeforeMs, durationMs),
    operatingMs,
    operatingMinutes: cumulativeStartedMinutes(priorOperatingMs, operatingMs),
    priorCredits: previous.reduce((total, part) => total + part.grossCredits, BigInt(0)),
  };
}

/** What a running part will be billed with: the figures an estimate cannot derive from the part itself. */
export function runningPartBilling(
  usage: UsagePartTimes,
  rates: UsagePartRates,
  previous: ContinuedUsagePart[] = [],
): RunningPartBilling {
  const { flatCredits, priorCredits } = usagePartCharges(usage, rates, previous);
  return {
    flatCredits,
    roundingStartTime: previous[previous.length - 1]?.startTime ?? usage.startTime,
    priorCredits: Number(priorCredits),
  };
}
