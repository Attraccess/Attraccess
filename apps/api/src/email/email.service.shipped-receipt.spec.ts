import {
  BillingTransaction,
  BillingTransactionItem,
  EmailTemplateType,
  Resource,
  ResourceUsage,
} from '@attraccess/database-entities';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  readDefaultTemplateBody,
  SHIPPED_TRANSLATIONS,
} from './../email-template/email-defaults';
import { inheritTestScope } from './../test-utils/inherit-test-scope';
import { makeUser, setup } from './email.service.test-fixture';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('EmailService shipped usage receipt', () => {
  const scope = {
    get setup() {
      return setup;
    },
    get makeUser() {
      return makeUser;
    },
  };

  describe('shipped usage receipt', () => {
    const receiptType = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;

    const setupReceipt = (locale: 'en' | 'de') => {
      const harness = scope.setup();
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
      const user = scope.makeUser({ creditBalance: 1234, locale, billingFactor: 20 });
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
    const shippedUsageReceiptScope = inheritTestScope(
      {
        get setupReceipt() {
          return setupReceipt;
        },
        get receiptType() {
          return receiptType;
        },
      },
      scope,
    );

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
      const { service, sendMail, user, usage, transaction } = shippedUsageReceiptScope.setupReceipt(locale);

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

    const sharedItems = () => {
      const item = (values: Partial<BillingTransactionItem>) => Object.assign(new BillingTransactionItem(), values);
      const segment = (startedAt: string, endedAt: string, participants: number) => ({
        startedAt,
        endedAt,
        participants,
      });
      return [
        item({ name: 'PER_SESSION', quantity: 1, unitPrice: 100 }),
        item({
          name: 'Energy',
          quantity: 1,
          unitPrice: 12,
          meterQuantity: '0.8',
          meterCreditsPerUnit: 15,
          allocation: {
            kind: 'meter',
            segments: [
              {
                ...segment('2026-09-20T10:00:00.000Z', '2026-09-20T10:30:00.000Z', 2),
                totalQuantity: '1.2',
                totalCredits: 18,
                shareQuantity: '0.6',
                shareCredits: 9,
              },
              {
                ...segment('2026-09-20T10:30:00.000Z', '2026-09-20T11:00:00.000Z', 3),
                totalQuantity: '1.2',
                totalCredits: 18,
                shareQuantity: '0.4',
                shareCredits: 3,
              },
            ],
          },
        }),
        item({
          name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
          quantity: 1,
          unitPrice: 7,
          durationMs: 90000,
          allocation: {
            kind: 'operating-time',
            segments: [
              {
                ...segment('2026-09-20T10:00:00.000Z', '2026-09-20T10:30:00.000Z', 2),
                totalQuantity: '120000',
                totalCredits: 8,
                shareQuantity: '60000',
                shareCredits: 4,
              },
              {
                ...segment('2026-09-20T10:30:00.000Z', '2026-09-20T11:00:00.000Z', 4),
                totalQuantity: '120000',
                totalCredits: 6,
                shareQuantity: '30000',
                shareCredits: 3,
              },
            ],
          },
        }),
      ];
    };

    it('adds shared fields and segments to the template context', async () => {
      const { service, user, usage, transaction } = shippedUsageReceiptScope.setupReceipt('en');
      transaction.items = sharedItems();
      transaction.amount = -119;
      const render = jest.spyOn(service as never, 'sendEmail').mockResolvedValue(undefined as never);

      await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);

      const items = (render.mock.calls[0][2] as { items: Record<string, unknown>[] }).items;
      expect(items[0]).toMatchObject({ isShared: false, isSharedMeter: false, segments: [] });
      expect(items[0].shareQuantity).toBeUndefined();
      expect(items[1]).toMatchObject({
        isShared: true,
        isSharedMeter: true,
        isSharedOperatingTime: false,
        quantity: '0.8',
        shareQuantity: '0.8',
        totalQuantity: '2.4',
        total: '0.12',
        segments: [
          {
            startedAt: '2026-09-20T10:00:00.000Z',
            endedAt: '2026-09-20T10:30:00.000Z',
            participants: 2,
            totalQuantity: '1.2',
            totalCredits: '0.18',
            shareQuantity: '0.6',
            shareCredits: '0.09',
          },
          expect.objectContaining({ participants: 3, shareCredits: '0.03' }),
        ],
      });
      expect(items[2]).toMatchObject({
        isShared: true,
        isSharedOperatingTime: true,
        isDuration: false,
        shareQuantity: '90',
        totalQuantity: '240',
      });
      expect((items[2].segments as Record<string, unknown>[])[0]).toMatchObject({
        totalQuantity: '120',
        shareQuantity: '60',
      });
    });

    it.each([
      {
        locale: 'en',
        texts: [
          'Shared',
          '0.8 — your share of 2.4',
          '90 s — your share of 240 s',
          '2 people, total 1.2 (0.18 credits), your share 0.6 (0.09 credits)',
          '4 people, total 120 s (0.06 credits), your share 30 s (0.03 credits)',
        ],
      },
      {
        locale: 'de',
        texts: [
          'Geteilt',
          '0.8 — dein Anteil an 2.4',
          '90 s — dein Anteil an 240 s',
          '2 Personen, gesamt 1.2 (0.18 Credits), dein Anteil 0.6 (0.09 Credits)',
          '4 Personen, gesamt 120 s (0.06 Credits), dein Anteil 30 s (0.03 Credits)',
        ],
      },
    ] as const)('renders the shared breakdown in $locale', async ({ locale, texts }) => {
      const { service, sendMail, user, usage, transaction } = shippedUsageReceiptScope.setupReceipt(locale);
      transaction.items = sharedItems();

      await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);

      const { html } = sendMail.mock.calls[0][0];
      for (const text of texts) expect(html).toContain(text);
      expect(html).toContain('2026-09-20T10:00:00.000Z');
      expect(html).not.toContain('PER_ATTRIBUTABLE_OPERATING_MINUTE');
    });

    it.each(['en', 'de'] as const)('renders solo sessions exactly as the previous default in %s', async (locale) => {
      const render = async (body: string) => {
        const { service, sendMail, emailTemplateService, user, usage, transaction } =
          shippedUsageReceiptScope.setupReceipt(locale);
        emailTemplateService.findOne.mockResolvedValue({
          type: shippedUsageReceiptScope.receiptType,
          subject: EMAIL_TEMPLATE_DEFAULTS[shippedUsageReceiptScope.receiptType].subject,
          body,
        });
        await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);
        return sendMail.mock.calls[0][0].html as string;
      };
      const previous = readFileSync(
        join(__dirname, '../database/migrations/__fixtures__/refreshed-meter-receipt-totals.mjml'),
        'utf8',
      );

      const current = await render(readDefaultTemplateBody(shippedUsageReceiptScope.receiptType));
      expect(current).toBe(await render(previous.trim()));
      expect(current).not.toContain('Shared');
      expect(current).not.toContain('Geteilt');
    });

    it.each(['en_US', 'de_DE', 'invalid!', '', '   '])(
      'sends a receipt with English number formatting when the persisted locale is %j',
      async (locale) => {
        const { service, sendMail, emailTemplateService, user, usage, transaction } =
          shippedUsageReceiptScope.setupReceipt('en');
        user.locale = locale;

        await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);

        expect(sendMail).toHaveBeenCalledTimes(1);
        expect(sendMail.mock.calls[0][0].html).toContain('Measured: 61.001 s');
        expect(emailTemplateService.getTranslationsMap).toHaveBeenCalledWith(
          shippedUsageReceiptScope.receiptType,
          locale === 'en_US' ? 'en-US' : locale === 'de_DE' ? 'de-DE' : 'en',
        );
      },
    );

    it.each(['en-US', 'de-DE'])('retains valid regional number formatting for %s', async (locale) => {
      const language = locale === 'de-DE' ? 'de' : 'en';
      const { service, sendMail, user, usage, transaction } = shippedUsageReceiptScope.setupReceipt(language);
      user.locale = locale;

      await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);

      expect(sendMail.mock.calls[0][0].html).toContain(
        locale === 'de-DE' ? 'Gemessen: 61,001 s' : 'Measured: 61.001 s',
      );
    });

    it('renders migrated energy and new meter charges from generic evidence without changing settled totals', async () => {
      const { service, sendMail, user, usage, transaction } = shippedUsageReceiptScope.setupReceipt('en');
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

    it('preserves every cent of a large captured meter rate in receipts', async () => {
      const { service, sendMail, user, usage, transaction } = shippedUsageReceiptScope.setupReceipt('en');
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

    it('preserves every cent of nonzero settled meter totals and the receipt balance', async () => {
      const { service, sendMail, user, usage, transaction } = shippedUsageReceiptScope.setupReceipt('en');
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

    it('renders historical rounded quantities without inventing raw durations or a factor snapshot', async () => {
      const { service, sendMail, user, usage, transaction } = shippedUsageReceiptScope.setupReceipt('en');
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
        const { service, sendMail, user, usage, transaction } = shippedUsageReceiptScope.setupReceipt('en');
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
});
