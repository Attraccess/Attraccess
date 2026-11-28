import type { Logger } from '@nestjs/common';
import { sessionStartOf, type UsageSession } from '@attraccess/application-models';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import type { BillingService } from '../../../../billing/charges/billing.service';
import type { StopResourceUsageSessionPayload } from '../../websocket.types';

type SessionEndSummary = Pick<StopResourceUsageSessionPayload, 'durationSeconds' | 'billingSummary'>;

/**
 * What the reader shows about a session that just ended. A session whose project was switched ends with its last
 * part, but the summary is about the whole of it: from the session start, with the charges of all parts.
 */
export async function sessionEndSummary(
  billingService: BillingService,
  logger: Logger,
  usage: UsageSession | undefined,
  userId: number,
): Promise<SessionEndSummary> {
  const startedAt = usage ? sessionStartOf(usage) : undefined;
  const start = startedAt ? new Date(startedAt).getTime() : NaN;
  const end = usage?.endTime ? new Date(usage.endTime).getTime() : NaN;
  const summary: SessionEndSummary =
    Number.isFinite(start) && Number.isFinite(end)
      ? { durationSeconds: Math.max(0, Math.floor((end - start) / 1000)) }
      : {};
  // Only the card holder's own session tells them what it cost.
  if (usage?.userId !== userId) return summary;

  // Billing lookup failures must not turn an already-ended session into a failed action.
  try {
    const charged =
      usage.previousUsageId == null
        ? (await billingService.getResourceUsageCharge(usage.id, userId))?.amount
        : (await billingService.getSwitchedSessionCharge(usage.id, userId))?.sessionAmount;
    if (charged) {
      const configuration = await billingService.getConfiguration();
      const amount = -charged;
      const total = new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: configuration.minorUnit,
        maximumFractionDigits: configuration.minorUnit,
      }).format(dbCurrencyToUserCurrency(amount, configuration.minorUnit));
      summary.billingSummary = { amount, total: `${total} ${configuration.currency}` };
    }
  } catch (error) {
    logger.warn(`Failed to load session billing summary: ${error.message}`);
  }
  return summary;
}
