import { ShippedUsageReceiptTestScope } from './email.service.spec';
export function registerShippedUsageReceiptRendersHistoricalRoundedQuantitiesWithoutInventingRawDurationsOrAFactorSnapshot(
  scope: ShippedUsageReceiptTestScope,
): void {
  it('renders historical rounded quantities without inventing raw durations or a factor snapshot', async () => {
    const { service, sendMail, user, usage, transaction } = scope.setupReceipt('en');
    usage.billingFactor = null;
    for (const item of transaction.items) item.durationMs = null;

    await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);

    const { html } = sendMail.mock.calls[0][0];
    expect(html).toContain('Billed: 2 min');
    expect(html).toContain('Billed: 1 min');
    expect(html).toContain('80%'); // The immutable adjustment description remains available.
    expect(html).not.toContain('Measured:');
    expect(html).not.toContain('Applied billing factor:');
    expect(html).not.toContain('999');
  });
}
