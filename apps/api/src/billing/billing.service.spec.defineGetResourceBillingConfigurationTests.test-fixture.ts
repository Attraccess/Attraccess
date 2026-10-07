import { registerGetResourceBillingConfigurationCreatesAndSavesDefaultConfigurationWhenNoneExists } from './billing.service.get-resource-billing-configuration-creates-and-saves-default-configuration-when-none-exists.test-cases';
import { registerGetResourceBillingConfigurationReturnsExistingConfigurationWhenPresent } from './billing.service.get-resource-billing-configuration-returns-existing-configuration-when-present.test-cases';
import { registerGetResourceBillingConfigurationChargesBothSnappedDurationRatesWithoutChangingLegacySessionDurationCharging } from './billing.service.get-resource-billing-configuration-charges-both-snapped-duration-rates-without-changing-legacy-session-duration-charging.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { BillingServiceTestScope } from './billing.service.spec';

export function defineGetResourceBillingConfigurationTests(parentScope: BillingServiceTestScope) {
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
  registerGetResourceBillingConfigurationCreatesAndSavesDefaultConfigurationWhenNoneExists(scope);

  registerGetResourceBillingConfigurationReturnsExistingConfigurationWhenPresent(scope);

  registerGetResourceBillingConfigurationChargesBothSnappedDurationRatesWithoutChangingLegacySessionDurationCharging(
    scope,
  );

  return scope;
}
