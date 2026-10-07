import { BillingTransactionItem } from '@attraccess/database-entities';
import { ShippedUsageReceiptTestScope } from './email.service.spec';
export function registerShippedUsageReceiptPreservesEveryCentOfNonzeroSettledMeterTotalsAndTheReceiptBalance(
  scope: ShippedUsageReceiptTestScope,
): void {
  it('preserves every cent of nonzero settled meter totals and the receipt balance', async () => {
    const { service, sendMail, user, usage, transaction } = scope.setupReceipt('en');
    user.creditBalance = Number.MAX_SAFE_INTEGER;
    transaction.amount = -Number.MAX_SAFE_INTEGER;
    transaction.items = [
      Object.assign(new BillingTransactionItem(), {
        name: 'Heartbeats',
        quantity: 1,
        unitPrice: Number.MAX_SAFE_INTEGER,
        meterQuantity: '1',
        meterCreditsPerUnit: Number.MAX_SAFE_INTEGER,
      }),
    ];
    await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);
    const { html } = sendMail.mock.calls[0][0];
    expect(html).toContain('>90071992547409.91</td>');
    expect(html.match(/90071992547409\.91/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).not.toContain('90071992547409.9<');
  });
}
