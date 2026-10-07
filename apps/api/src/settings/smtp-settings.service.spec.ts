import { registerSmtpSettingsServiceFixture } from './smtp-settings.service.smtp-settings-service.test-fixture';
import { registerBuildTransportOptionsCases } from './smtp-settings.service.smtp-settings-service.build-transport-options.test-cases';
import { registerUpdateSettingsVerificationBeforeSaveCases } from './smtp-settings.service.smtp-settings-service.update-settings-verification-before-save.test-cases';
import { registerUpdateSettingsSmtpErrorMessagesCases } from './smtp-settings.service.smtp-settings-service.update-settings-smtp-error-messages.test-cases';
import { registerUpdateSettingsVerifyTimeoutCases } from './smtp-settings.service.smtp-settings-service.update-settings-verify-timeout.test-cases';
import { registerUpdateSettingsOutlook365TransportCases } from './smtp-settings.service.smtp-settings-service.update-settings-outlook365-transport.test-cases';
import { registerGetSettingsCases } from './smtp-settings.service.smtp-settings-service.get-settings.test-cases';
import { registerGetConfigurationCases } from './smtp-settings.service.smtp-settings-service.get-configuration.test-cases';
describe('SmtpSettingsService', () => {
  const fixture = registerSmtpSettingsServiceFixture();
  registerBuildTransportOptionsCases(fixture);
  registerUpdateSettingsVerificationBeforeSaveCases(fixture);
  registerUpdateSettingsSmtpErrorMessagesCases(fixture);
  registerUpdateSettingsVerifyTimeoutCases(fixture);
  registerUpdateSettingsOutlook365TransportCases(fixture);
  registerGetSettingsCases(fixture);
  registerGetConfigurationCases(fixture);
});
