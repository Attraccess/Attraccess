import { BillingTransactionItem } from '@attraccess/database-entities';
import { ShippedUsageReceiptTestScope } from './email.service.spec';
export function registerShippedUsageReceiptPreservesEveryCentOfALargeCapturedMeterRateInReceipts(
  scope: ShippedUsageReceiptTestScope,
): void {
  it('preserves every cent of a large captured meter rate in receipts', async () => {
    const { service, sendMail, user, usage, transaction } = scope.setupReceipt('en');
    transaction.items = [
      Object.assign(new BillingTransactionItem(), {
        name: 'Heartbeats',
        quantity: 1,
        unitPrice: 0,
        meterQuantity: '0',
        meterCreditsPerUnit: Number.MAX_SAFE_INTEGER,
      }),
    ];
    await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);
    expect(sendMail.mock.calls[0][0].html).toContain('90071992547409.91');
  });
}
