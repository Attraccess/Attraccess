import { ShippedUsageReceiptTestScope } from './email.service.spec';
export function registerShippedUsageReceiptRendersAFrozenIFactorAndZeroRawDurationWithoutATruthinessFallback(
  scope: ShippedUsageReceiptTestScope,
): void {
  it.each([0, 100])(
    'renders a frozen %i%% factor and zero raw duration without a truthiness fallback',
    async (factor) => {
      const { service, sendMail, user, usage, transaction } = scope.setupReceipt('en');
      usage.billingFactor = factor;
      transaction.items = transaction.items.filter((item) => item.name !== 'BILLING_FACTOR');
      const operatingItem = transaction.items.find((item) => item.name === 'PER_ATTRIBUTABLE_OPERATING_MINUTE');
      operatingItem.durationMs = 0;
      operatingItem.quantity = 0;

      await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);

      const { html } = sendMail.mock.calls[0][0];
      expect(html).toContain(`Applied billing factor: ${factor}%`);
      expect(html).toContain('Measured: 0 s');
      expect(html).toContain('Billed: 0 min');
    },
  );
}
