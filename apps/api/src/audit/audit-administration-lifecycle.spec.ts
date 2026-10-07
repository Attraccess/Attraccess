import { registerAdministrationLifecycleHooksFixture } from './audit-administration-lifecycle.administration-lifecycle-hooks.test-fixture';
import { registerAwaitsMqttRecordingCoversCreateUpdateDeleteAndExcludesCredentialsAndCertifCases } from './audit-administration-lifecycle.administration-lifecycle-hooks.awaits-mqtt-recording-covers-create-update-delete-and-excludes-credentials-and-certif.behaviors.test-cases';
import { registerRecordsTemplateAndLayoutEditsResetsAndTranslationsWithoutBodyContentCases } from './audit-administration-lifecycle.administration-lifecycle-hooks.records-setting-keys-safe-before-after-values-and-credential-rotation-without-secret-.behaviors.test-cases';
import { registerRecordsSettingKeysSafeBeforeAfterValuesAndCredentialRotationWithoutSecretCases } from './audit-administration-lifecycle.administration-lifecycle-hooks.records-setting-keys-safe-before-after-values-and-credential-rotation-without-secret-.behaviors.test-cases';
import { registerRecordsAuditMetricsAndRateLimitChangesUsingTheExactSupportedSettingKeysCases } from './audit-administration-lifecycle.administration-lifecycle-hooks.awaits-mqtt-recording-covers-create-update-delete-and-excludes-credentials-and-certif.behaviors.test-cases';
import { registerRecordsZipUploadDeletionAndRetryWithoutArchiveContentOrRawErrorsCases } from './audit-administration-lifecycle.administration-lifecycle-hooks.records-setting-keys-safe-before-after-values-and-credential-rotation-without-secret-.behaviors.test-cases';
import { registerRecordsRegistryLifecyclePackageConfigurationAndRemovalUsingSafeIdentifiersCases } from './audit-administration-lifecycle.administration-lifecycle-hooks.awaits-mqtt-recording-covers-create-update-delete-and-excludes-credentials-and-certif.behaviors.test-cases';
import { registerRecordsObservedInstallReplacementOutcomesAndPreservesFailedOperationErrorsWCases } from './audit-administration-lifecycle.administration-lifecycle-hooks.awaits-mqtt-recording-covers-create-update-delete-and-excludes-credentials-and-certif.behaviors.test-cases';
describe('administration lifecycle hooks', () => {
  const fixture = registerAdministrationLifecycleHooksFixture();
  registerAwaitsMqttRecordingCoversCreateUpdateDeleteAndExcludesCredentialsAndCertifCases(fixture);
  registerRecordsTemplateAndLayoutEditsResetsAndTranslationsWithoutBodyContentCases(fixture);
  registerRecordsSettingKeysSafeBeforeAfterValuesAndCredentialRotationWithoutSecretCases(fixture);
  registerRecordsAuditMetricsAndRateLimitChangesUsingTheExactSupportedSettingKeysCases(fixture);
  registerRecordsZipUploadDeletionAndRetryWithoutArchiveContentOrRawErrorsCases(fixture);
  registerRecordsRegistryLifecyclePackageConfigurationAndRemovalUsingSafeIdentifiersCases(fixture);
  registerRecordsObservedInstallReplacementOutcomesAndPreservesFailedOperationErrorsWCases(fixture);
});
