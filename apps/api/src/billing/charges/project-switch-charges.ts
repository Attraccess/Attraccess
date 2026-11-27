import { ProjectSwitchCharging } from '@attraccess/application-models';
import { applyBillingFactor, toExactCredits } from '@attraccess/shared';
import type { ContinuedUsagePart } from '../ports/billing-ledger.port';
import type { BillableUsage } from './billable-usage';

const MINUTE_MS = 60_000;

/** Whole minutes as billed: every started minute counts. */
const startedMinutes = (ms: number) => Math.ceil(Math.max(0, ms) / MINUTE_MS);

/** Attribution originates from integer-millisecond intervals; remove only minute-storage float noise. */
const operatingMsOf = (minutes: number | null | undefined) => Math.round((minutes ?? 0) * MINUTE_MS);

export interface UsagePartRates {
  creditsPerUsage: number;
  creditsPerMinute: number;
  creditsPerOperatingMinute: number;
}

/** What one usage record bills for itself, whether it is a whole session or one part of a switched one. */
export interface UsagePartCharges {
  flatCredits: number;
  durationMs: number;
  minutes: number;
  operatingMs: number;
  operatingMinutes: number;
  /**
   * The time charges the earlier parts of a cumulatively rounded run made. The billing factor is rounded on the
   * running total too, so a switched session costs what an unsplit one does.
   */
  priorCredits: bigint;
}

/** A continuation in one of the continuing modes pays no further fee per use. */
const paysFlatFee = (mode: ProjectSwitchCharging | null | undefined) =>
  !mode || mode === ProjectSwitchCharging.NEW_SESSION;

/** Whether the part's minutes are rounded together with the parts before it, which then have to be read. */
export const roundsWithPreviousParts = (usage: BillableUsage): boolean =>
  usage.projectSwitchCharging === ProjectSwitchCharging.CONTINUE && usage.previousUsageId != null;

/**
 * `previous` are the earlier parts the usage is rounded together with, newest first, down to the first one that
 * rounded on its own; it is empty for every other usage.
 */
export function usagePartCharges(
  usage: BillableUsage,
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
  const priorMinutes = startedMinutes(elapsedBeforeMs);
  const priorOperatingMinutes = startedMinutes(priorOperatingMs);
  return {
    flatCredits,
    durationMs,
    minutes: startedMinutes(elapsedBeforeMs + durationMs) - priorMinutes,
    operatingMs,
    operatingMinutes: startedMinutes(priorOperatingMs + operatingMs) - priorOperatingMinutes,
    priorCredits:
      toExactCredits(paysFlatFee(first.projectSwitchCharging) ? rates.creditsPerUsage : 0) +
      toExactCredits(rates.creditsPerMinute) * BigInt(priorMinutes) +
      toExactCredits(rates.creditsPerOperatingMinute) * BigInt(priorOperatingMinutes),
  };
}

/** The billing factor on this part's gross, rounded so that the parts' discounts add up to the one of their sum. */
export function applyPartBillingFactor(priorCredits: bigint, gross: bigint, factor: number) {
  const discount =
    applyBillingFactor(priorCredits + gross, factor).discount - applyBillingFactor(priorCredits, factor).discount;
  return { amount: Number(gross - BigInt(discount)), discount };
}
