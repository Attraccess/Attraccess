import { BillingTransactionItem } from '@attraccess/database-entities';
import { ShippedUsageReceiptTestScope } from './email.service.spec';
export function registerShippedUsageReceiptRendersMigratedEnergyAndNewMeterChargesFromGenericEvidenceWithoutChangingSettledTotals(
  scope: ShippedUsageReceiptTestScope,
): void {
  it('renders migrated energy and new meter charges from generic evidence without changing settled totals', async () => {
    const { service, sendMail, user, usage, transaction } = scope.setupReceipt('en');
    transaction.amount = -45;
    transaction.items = [
      Object.assign(new BillingTransactionItem(), {
        name: 'Energy (kWh)',
        quantity: 1,
        unitPrice: 45,
        meterQuantity: '1.5',
        meterCreditsPerUnit: 30,
      }),
      Object.assign(new BillingTransactionItem(), {
        name: 'PER_MINUTE',
        quantity: 1,
        unitPrice: 0,
        meterQuantity: '9007199254740993.123456789',
        meterCreditsPerUnit: 0,
      }),
    ];
    await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);
    const { html } = sendMail.mock.calls[0][0];
    expect(html).toContain('Energy (kWh)');
    expect(html).toContain('1.5');
    expect(html).toContain('0.3');
    expect(html).toContain('0.45');
    expect(html).toContain('9007199254740993.123456789');
    expect(html).toContain('PER_MINUTE');
    expect(html).not.toContain('Session time');
    expect(html).not.toContain('credits/min');
  });
}
