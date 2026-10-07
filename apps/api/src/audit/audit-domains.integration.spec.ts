import { registerAuditDomainsThroughMigratedStorageAndTheAdminHttpApiFixture } from './audit-domains.integration.audit-domains-through-migrated-storage-and-the-admin-http-api.test-fixture';
import { registerExposesDomainEventsThroughEveryAdminFilterWithoutMixingTargetsCases } from './audit-domains.integration.audit-domains-through-migrated-storage-and-the-admin-http-api.enforces-audit-permissions-independently-of-settings-administration-and-token-owner-p.behaviors.test-cases';
import { registerSuppressesOnlyTheDisabledDomainWhileRetainingItsExistingHistoryCases } from './audit-domains.integration.audit-domains-through-migrated-storage-and-the-admin-http-api.suppresses-only-the-disabled-domain-while-retaining-its-existing-history.test-cases';
import { registerPausesAllCaptureWithoutHidingPriorEventsAndResumesThroughPersistedSettingsCases } from './audit-domains.integration.audit-domains-through-migrated-storage-and-the-admin-http-api.enforces-audit-permissions-independently-of-settings-administration-and-token-owner-p.behaviors.test-cases';
import { registerEnforcesAuditPermissionsIndependentlyOfSettingsAdministrationAndTokenOwnerPCases } from './audit-domains.integration.audit-domains-through-migrated-storage-and-the-admin-http-api.enforces-audit-permissions-independently-of-settings-administration-and-token-owner-p.behaviors.test-cases';
import { registerPaginatesAcrossDomainsAndAppliesShortenedRetentionBeforeCleanupCases } from './audit-domains.integration.audit-domains-through-migrated-storage-and-the-admin-http-api.enforces-audit-permissions-independently-of-settings-administration-and-token-owner-p.behaviors.test-cases';
import { registerKeepsRepresentativeCredentialBearingInputsOutOfStoredAndExportedDetailsCases } from './audit-domains.integration.audit-domains-through-migrated-storage-and-the-admin-http-api.enforces-audit-permissions-independently-of-settings-administration-and-token-owner-p.behaviors.test-cases';
import { registerRecordsPasswordPolicySnapshotsForValidGeneratedRoleKeysEndingInASeparatorCases } from './audit-domains.integration.audit-domains-through-migrated-storage-and-the-admin-http-api.enforces-audit-permissions-independently-of-settings-administration-and-token-owner-p.behaviors.test-cases';
describe('audit domains through migrated storage and the admin HTTP API', () => {
  const fixture = registerAuditDomainsThroughMigratedStorageAndTheAdminHttpApiFixture();
  registerExposesDomainEventsThroughEveryAdminFilterWithoutMixingTargetsCases(fixture);
  registerSuppressesOnlyTheDisabledDomainWhileRetainingItsExistingHistoryCases(fixture);
  registerPausesAllCaptureWithoutHidingPriorEventsAndResumesThroughPersistedSettingsCases(fixture);
  registerEnforcesAuditPermissionsIndependentlyOfSettingsAdministrationAndTokenOwnerPCases(fixture);
  registerPaginatesAcrossDomainsAndAppliesShortenedRetentionBeforeCleanupCases(fixture);
  registerKeepsRepresentativeCredentialBearingInputsOutOfStoredAndExportedDetailsCases(fixture);
  registerRecordsPasswordPolicySnapshotsForValidGeneratedRoleKeysEndingInASeparatorCases(fixture);
});
