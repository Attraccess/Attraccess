import { ShippedUsageReceiptTestScope } from './email.service.spec';
export function registerShippedUsageReceiptRetainsValidRegionalNumberFormattingForS(
  scope: ShippedUsageReceiptTestScope,
): void {
  it.each(['en-US', 'de-DE'])('retains valid regional number formatting for %s', async (locale) => {
    const language = locale === 'de-DE' ? 'de' : 'en';
    const { service, sendMail, user, usage, transaction } = scope.setupReceipt(language);
    user.locale = locale;

    await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);

    expect(sendMail.mock.calls[0][0].html).toContain(locale === 'de-DE' ? 'Gemessen: 61,001 s' : 'Measured: 61.001 s');
  });
}
