import {
  BillingTransaction,
  BillingTransactionItem,
  EmailTemplateType,
  Resource,
  ResourceUsage,
} from '@attraccess/database-entities';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  readDefaultTemplateBody,
  SHIPPED_TRANSLATIONS,
} from '../email-template/email-defaults';
import { registerEmailServiceFixture } from './email.service.email-service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
export function registerShippedUsageReceiptCases(fixture: ReturnType<typeof registerEmailServiceFixture>) {
  describe('shipped usage receipt', () => {
    const receiptType = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;

    const setupReceipt = (locale: 'en' | 'de') => {
      const harness = fixture.setup();
      harness.emailTemplateService.findOne.mockResolvedValue({
        type: receiptType,
        subject: EMAIL_TEMPLATE_DEFAULTS[receiptType].subject,
        body: readDefaultTemplateBody(receiptType),
      });
      harness.emailTemplateService.getTranslationsMap.mockResolvedValue(
        Object.fromEntries(
          SHIPPED_TRANSLATIONS.filter((row) => row.templateType === receiptType && row.locale === locale).map((row) => [
            row.key,
            row.value,
          ]),
        ),
      );
      const user = fixture.makeUser({ creditBalance: 1234, locale, billingFactor: 20 });
      const usage = Object.assign(new ResourceUsage(), {
        startTime: new Date('2026-09-20T10:00:00Z'),
        endTime: new Date('2026-09-20T10:01:01.001Z'),
        usageInMinutes: 999,
        billingFactor: 80,
        resource: Object.assign(new Resource(), { id: 3, name: 'Laser <script>unsafe</script>' }),
      });
      const item = (values: Partial<BillingTransactionItem>) => Object.assign(new BillingTransactionItem(), values);
      const transaction = Object.assign(new BillingTransaction(), {
        amount: -94,
        items: [
          item({ name: 'PER_SESSION', quantity: 1, unitPrice: 100 }),
          item({ name: 'PER_MINUTE', quantity: 2, unitPrice: 5, durationMs: 61001 }),
          item({ name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE', quantity: 1, unitPrice: 7, durationMs: 60000 }),
          item({ name: 'BILLING_FACTOR', quantity: 1, unitPrice: -23, description: '80%' }),
          item({
            name: 'Custom <strong>item</strong>',
            description: '<script>item description</script>',
            quantity: 1,
            unitPrice: 0,
          }),
        ],
      });
      return { ...harness, user, usage, transaction };
    };

    it.each([
      {
        locale: 'en',
        labels: [
          'Session time',
          'Attributable operating time',
          'Fixed session fee',
          'Billing factor adjustment',
          'Measured: 61.001 s',
          'Measured: 60 s',
          'Billed: 2 min',
          'Billed: 1 min',
          '0.05 credits/min',
          '0.07 credits/min',
          'Applied billing factor: 80%',
        ],
      },
      {
        locale: 'de',
        labels: [
          'Sitzungszeit',
          'Zugeordnete Betriebszeit',
          'Feste Sitzungsgebühr',
          'Anpassung durch Abrechnungsfaktor',
          'Gemessen: 61,001 s',
          'Gemessen: 60 s',
          'Abgerechnet: 2 min',
          'Abgerechnet: 1 min',
          '0.05 Credits/min',
          '0.07 Credits/min',
          'Angewendeter Abrechnungsfaktor: 80%',
        ],
      },
    ] as const)('renders immutable calculations and escaped custom content in $locale', async ({ locale, labels }) => {
      const { service, sendMail, user, usage, transaction } = setupReceipt(locale);

      await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);

      const { html } = sendMail.mock.calls[0][0];
      for (const label of labels) expect(html).toContain(label);
      expect(html).toContain('>0.1</td>'); // 2 rounded session minutes at 0.05 credits/min.
      expect(html).toContain('0.07'); // 1 rounded operating minute at 0.07 credits/min.
      expect(html).toContain('-0.23');
      expect(html).toContain('0.94');
      expect(html).toContain('12.34');
      expect(html).toContain('Custom &lt;strong&gt;item&lt;/strong&gt;');
      expect(html).toContain('&lt;script&gt;item description&lt;/script&gt;');
      expect(html).toContain('Laser &lt;script&gt;unsafe&lt;/script&gt;');
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('PER_MINUTE');
      expect(html).not.toContain('PER_ATTRIBUTABLE_OPERATING_MINUTE');
      expect(html).not.toContain('999');
      expect(html).not.toContain('20%'); // Current user factor cannot alter a historical receipt.
    });

    it.each(['en_US', 'de_DE', 'invalid!', '', '   '])(
      'sends a receipt with English number formatting when the persisted locale is %j',
      async (locale) => {
        const { service, sendMail, emailTemplateService, user, usage, transaction } = setupReceipt('en');
        user.locale = locale;

        await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);

        expect(sendMail).toHaveBeenCalledTimes(1);
        expect(sendMail.mock.calls[0][0].html).toContain('Measured: 61.001 s');
        expect(emailTemplateService.getTranslationsMap).toHaveBeenCalledWith(receiptType, locale);
      },
    );

    it.each(['en-US', 'de-DE'])('retains valid regional number formatting for %s', async (locale) => {
      const language = locale === 'de-DE' ? 'de' : 'en';
      const { service, sendMail, user, usage, transaction } = setupReceipt(language);
      user.locale = locale;

      await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);

      expect(sendMail.mock.calls[0][0].html).toContain(
        locale === 'de-DE' ? 'Gemessen: 61,001 s' : 'Measured: 61.001 s',
      );
    });

    it('renders historical rounded quantities without inventing raw durations or a factor snapshot', async () => {
      const { service, sendMail, user, usage, transaction } = setupReceipt('en');
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

    it.each([0, 100])(
      'renders a frozen %i%% factor and zero raw duration without a truthiness fallback',
      async (factor) => {
        const { service, sendMail, user, usage, transaction } = setupReceipt('en');
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
  });
}
