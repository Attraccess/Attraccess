import type { Logger } from '@nestjs/common';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import type { BillingService } from '../../../../billing/charges/billing.service';

/**
 * What the ended session cost its user, as the reader's session summary shows it. Billing lookup failures must not
 * turn an already-ended session into a failed action, so they only leave the summary out.
 */
export async function readerBillingSummary(
  billingService: BillingService,
  logger: Pick<Logger, 'warn'>,
  usageId: number,
  userId: number,
): Promise<{ amount: number; total: string } | undefined> {
  try {
    const charge = await billingService.getResourceUsageCharge(usageId, userId);
    if (!charge || charge.amount === 0) return undefined;
    const configuration = await billingService.getConfiguration();
    const amount = -charge.amount;
    const total = new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: configuration.minorUnit,
      maximumFractionDigits: configuration.minorUnit,
    }).format(dbCurrencyToUserCurrency(amount, configuration.minorUnit));
    return { amount, total: `${total} ${configuration.currency}` };
  } catch (error) {
    logger.warn(`Failed to load session billing summary: ${(error as Error).message}`);
    return undefined;
  }
}
