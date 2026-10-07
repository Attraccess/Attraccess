import { ShippedUsageReceiptTestScope } from './email.service.spec';
export function registerShippedUsageReceiptSendsAReceiptWithEnglishNumberFormattingWhenThePersistedLocaleIsJ(
  scope: ShippedUsageReceiptTestScope,
): void {
  it.each(['en_US', 'de_DE', 'invalid!', '', '   '])(
    'sends a receipt with English number formatting when the persisted locale is %j',
    async (locale) => {
      const { service, sendMail, emailTemplateService, user, usage, transaction } = scope.setupReceipt('en');
      user.locale = locale;

      await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0].html).toContain('Measured: 61.001 s');
      expect(emailTemplateService.getTranslationsMap).toHaveBeenCalledWith(scope.receiptType, locale);
    },
  );
}
