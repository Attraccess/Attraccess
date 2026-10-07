import { registerUpdateResourceBillingConfigurationThrowsWhenConfigurationNotFound } from './billing.service.update-resource-billing-configuration-throws-when-configuration-not-found.test-cases';
import { registerUpdateResourceBillingConfigurationThrowsWhenCreditsPerMinuteIsNegative } from './billing.service.update-resource-billing-configuration-throws-when-credits-per-minute-is-negative.test-cases';
import { registerUpdateResourceBillingConfigurationThrowsWhenCreditsPerUsageIsNegative } from './billing.service.update-resource-billing-configuration-throws-when-credits-per-usage-is-negative.test-cases';
import { registerUpdateResourceBillingConfigurationCoercesNullsTo0AndSaves } from './billing.service.update-resource-billing-configuration-coerces-nulls-to-0-and-saves.test-cases';
import { registerUpdateResourceBillingConfigurationThrowsOnFractionalValues } from './billing.service.update-resource-billing-configuration-throws-on-fractional-values.test-cases';
import { registerUpdateResourceBillingConfigurationTreatsACapturedMeterRateAloneAsBillingBeingEnabled } from './billing.service.update-resource-billing-configuration-treats-a-captured-meter-rate-alone-as-billing-being-enabled.test-cases';
import { registerUpdateResourceBillingConfigurationAllowsPartialUpdateWithoutValidatingUndefinedFields } from './billing.service.update-resource-billing-configuration-allows-partial-update-without-validating-undefined-fields.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { BillingServiceTestScope } from './billing.service.spec';

export function defineUpdateResourceBillingConfigurationTests(parentScope: BillingServiceTestScope) {
  const scope = inheritTestScope(
    {
      get resourceBillingConfigurationRepository() {
        return parentScope.resourceBillingConfigurationRepository;
      },
      set resourceBillingConfigurationRepository(value: typeof parentScope.resourceBillingConfigurationRepository) {
        parentScope.resourceBillingConfigurationRepository = value;
      },
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
    },
    parentScope,
  );
  registerUpdateResourceBillingConfigurationThrowsWhenConfigurationNotFound(scope);

  registerUpdateResourceBillingConfigurationThrowsWhenCreditsPerMinuteIsNegative(scope);

  registerUpdateResourceBillingConfigurationThrowsWhenCreditsPerUsageIsNegative(scope);

  registerUpdateResourceBillingConfigurationCoercesNullsTo0AndSaves(scope);

  registerUpdateResourceBillingConfigurationThrowsOnFractionalValues(scope);

  registerUpdateResourceBillingConfigurationTreatsACapturedMeterRateAloneAsBillingBeingEnabled(scope);

  registerUpdateResourceBillingConfigurationAllowsPartialUpdateWithoutValidatingUndefinedFields(scope);

  return scope;
}
