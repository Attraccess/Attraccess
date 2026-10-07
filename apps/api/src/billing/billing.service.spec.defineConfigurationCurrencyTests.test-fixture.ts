import { registerConfigurationCurrencySetConfigurationThrowsOnInvalidCurrency } from './billing.service.configuration-currency-set-configuration-throws-on-invalid-currency.test-cases';
import { registerConfigurationCurrencySetConfigurationUpdatesExistingCurrencySettingAndReturnsConfiguration } from './billing.service.configuration-currency-set-configuration-updates-existing-currency-setting-and-returns-configuration.test-cases';
import { registerConfigurationCurrencySetConfigurationInsertsCurrencyWhenNotExistingAndReturnsConfiguration } from './billing.service.configuration-currency-set-configuration-inserts-currency-when-not-existing-and-returns-configuration.test-cases';
import { registerConfigurationCurrencyGetConfigurationReturnsDefaultsWhenNoSettingPresent } from './billing.service.configuration-currency-get-configuration-returns-defaults-when-no-setting-present.test-cases';
import { registerConfigurationCurrencyGetConfigurationThrowsOnUnsupportedCurrencyValueFromDb } from './billing.service.configuration-currency-get-configuration-throws-on-unsupported-currency-value-from-db.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { BillingServiceTestScope } from './billing.service.spec';

export function defineConfigurationCurrencyTests(parentScope: BillingServiceTestScope) {
  const scope = inheritTestScope(
    {
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get settingRepository() {
        return parentScope.settingRepository;
      },
      set settingRepository(value: typeof parentScope.settingRepository) {
        parentScope.settingRepository = value;
      },
    },
    parentScope,
  );
  registerConfigurationCurrencySetConfigurationThrowsOnInvalidCurrency(scope);

  registerConfigurationCurrencySetConfigurationUpdatesExistingCurrencySettingAndReturnsConfiguration(scope);

  registerConfigurationCurrencySetConfigurationInsertsCurrencyWhenNotExistingAndReturnsConfiguration(scope);

  registerConfigurationCurrencyGetConfigurationReturnsDefaultsWhenNoSettingPresent(scope);

  registerConfigurationCurrencyGetConfigurationThrowsOnUnsupportedCurrencyValueFromDb(scope);

  return scope;
}
