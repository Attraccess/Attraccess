import {
  EmailTemplateType,
  BillingTransaction,
  BillingTransactionItem,
  ResourceUsage,
  Resource,
} from '@attraccess/database-entities';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  readDefaultTemplateBody,
  SHIPPED_TRANSLATIONS,
} from '../email-template/email-defaults';
import { registerShippedUsageReceiptRendersImmutableCalculationsAndEscapedCustomContentInLocale } from './email.service.shipped-usage-receipt-renders-immutable-calculations-and-escaped-custom-content-in-locale.test-cases';
import { registerShippedUsageReceiptSendsAReceiptWithEnglishNumberFormattingWhenThePersistedLocaleIsJ } from './email.service.shipped-usage-receipt-sends-a-receipt-with-english-number-formatting-when-the-persisted-locale-is-j.test-cases';
import { registerShippedUsageReceiptRetainsValidRegionalNumberFormattingForS } from './email.service.shipped-usage-receipt-retains-valid-regional-number-formatting-for-s.test-cases';
import { registerShippedUsageReceiptRendersMigratedEnergyAndNewMeterChargesFromGenericEvidenceWithoutChangingSettledTotals } from './email.service.shipped-usage-receipt-renders-migrated-energy-and-new-meter-charges-from-generic-evidence-without-changing-settled-totals.test-cases';
import { registerShippedUsageReceiptPreservesEveryCentOfALargeCapturedMeterRateInReceipts } from './email.service.shipped-usage-receipt-preserves-every-cent-of-a-large-captured-meter-rate-in-receipts.test-cases';
import { registerShippedUsageReceiptPreservesEveryCentOfNonzeroSettledMeterTotalsAndTheReceiptBalance } from './email.service.shipped-usage-receipt-preserves-every-cent-of-nonzero-settled-meter-totals-and-the-receipt-balance.test-cases';
import { registerShippedUsageReceiptRendersHistoricalRoundedQuantitiesWithoutInventingRawDurationsOrAFactorSnapshot } from './email.service.shipped-usage-receipt-renders-historical-rounded-quantities-without-inventing-raw-durations-or-a-factor-snapshot.test-cases';
import { registerShippedUsageReceiptRendersAFrozenIFactorAndZeroRawDurationWithoutATruthinessFallback } from './email.service.shipped-usage-receipt-renders-a-frozen-i-factor-and-zero-raw-duration-without-a-truthiness-fallback.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { EmailServiceTestScope } from './email.service.spec';

export function defineShippedUsageReceiptTests(parentScope: EmailServiceTestScope) {
  const receiptType = EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY;

  const setupReceipt = (locale: 'en' | 'de') => {
    const harness = parentScope.setup();
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
    const user = parentScope.makeUser({ creditBalance: 1234, locale, billingFactor: 20 });
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
  const scope = inheritTestScope(
    {
      get setupReceipt() {
        return setupReceipt;
      },
      get receiptType() {
        return receiptType;
      },
    },
    parentScope,
  );

  registerShippedUsageReceiptRendersImmutableCalculationsAndEscapedCustomContentInLocale(scope);

  registerShippedUsageReceiptSendsAReceiptWithEnglishNumberFormattingWhenThePersistedLocaleIsJ(scope);

  registerShippedUsageReceiptRetainsValidRegionalNumberFormattingForS(scope);

  registerShippedUsageReceiptRendersMigratedEnergyAndNewMeterChargesFromGenericEvidenceWithoutChangingSettledTotals(
    scope,
  );

  registerShippedUsageReceiptPreservesEveryCentOfALargeCapturedMeterRateInReceipts(scope);

  registerShippedUsageReceiptPreservesEveryCentOfNonzeroSettledMeterTotalsAndTheReceiptBalance(scope);

  registerShippedUsageReceiptRendersHistoricalRoundedQuantitiesWithoutInventingRawDurationsOrAFactorSnapshot(scope);

  registerShippedUsageReceiptRendersAFrozenIFactorAndZeroRawDurationWithoutATruthinessFallback(scope);

  return scope;
}
