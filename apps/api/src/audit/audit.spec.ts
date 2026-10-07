import { AuditLog, Setting, entities } from '@attraccess/database-entities';
import { ValidationPipe } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import * as migrations from '../database/migrations';
import { DurableAudit1783700000000 } from '../database/migrations/1783700000000-durable-audit';
import { IdentityAudit1783800000000 } from '../database/migrations/1783800000000-identity-audit';
import { RetirePasswordPolicyAudit1783900000000 } from '../database/migrations/1783900000000-retire-password-policy-audit';
import { SettingsStoreService } from '../settings/settings-store.service';
import { AuditQueryDto } from './audit-query.dto';
import { registerAuditAuthorizationAndQueryValidationFixture } from './audit.audit-authorization-and-query-validation.test-fixture';
import { registerUsesTheEffectivePermissionGuardForBothSessionAndTokenCeilingsCases } from './audit.audit-authorization-and-query-validation.uses-the-effective-permission-guard-for-both-session-and-token-ceilings.test-cases';
import { registerValidatesAuditQueryBoundsAndAllowsTheRegisteredResourceAndBillingFiltersCases } from './audit.audit-authorization-and-query-validation.validates-audit-query-bounds-and-allows-the-registered-resource-and-billing-filters.test-cases';
import { AuditController } from './audit.controller';
import { registerAppliesRetentionSettingChangesToReadsImmediatelyAndRejectsMalformedPersisteCases } from './audit.durable-audit-sqlite.applies-retention-setting-changes-to-reads-immediately-and-rejects-malformed-persiste.behaviors.test-cases';
import { registerBoundsAdmissionBeforeSettingsAwaitsAndRecoversAfterSettingsFailureCases } from './audit.durable-audit-sqlite.applies-retention-setting-changes-to-reads-immediately-and-rejects-malformed-persiste.behaviors.test-cases';
import { registerBoundsOutstandingWritesWithoutAnUnboundedQueueCases } from './audit.durable-audit-sqlite.applies-retention-setting-changes-to-reads-immediately-and-rejects-malformed-persiste.behaviors.test-cases';
import { registerDeclinesWritesUnderSqliteContentionWithinADeadlineAndRecoversCases } from './audit.durable-audit-sqlite.applies-retention-setting-changes-to-reads-immediately-and-rejects-malformed-persiste.behaviors.test-cases';
import { registerDiscardsABillingEventWhenItsOriginatingTransactionRollsBackCases } from './audit.durable-audit-sqlite.applies-retention-setting-changes-to-reads-immediately-and-rejects-malformed-persiste.behaviors.test-cases';
import { registerDoesNotPersistSsoEventsWhileTheSsoDomainIsDisabledCases } from './audit.durable-audit-sqlite.applies-retention-setting-changes-to-reads-immediately-and-rejects-malformed-persiste.behaviors.test-cases';
import { registerDoesNotRollBackARecordedEventWhenAPausedCleanupTransactionFailsCases } from './audit.durable-audit-sqlite.applies-retention-setting-changes-to-reads-immediately-and-rejects-malformed-persiste.behaviors.test-cases';
import { registerDrainsMultipleBoundedRetentionBatchesAndFiltersEventPrefixesAndTimeWindowsCases } from './audit.durable-audit-sqlite.applies-retention-setting-changes-to-reads-immediately-and-rejects-malformed-persiste.behaviors.test-cases';
import { registerEnforcesHttpSessionPermissionsTokenCeilingsQueryValidationAndPersistedSettiCases } from './audit.durable-audit-sqlite.enforces-http-session-permissions-token-ceilings-query-validation-and-persisted-setti.test-cases';
import { registerFailsClosedOnDisabledCaptureUnsupportedDomainsInvalidInputAndWriteFailureCases } from './audit.durable-audit-sqlite.fails-closed-on-disabled-capture-unsupported-domains-invalid-input-and-write-failure.behaviors.test-cases';
import { registerFiltersAndPaginatesWithoutDuplicationHidesExpiredRowsAndCleansThemCases } from './audit.durable-audit-sqlite.fails-closed-on-disabled-capture-unsupported-domains-invalid-input-and-write-failure.behaviors.test-cases';
import { registerNeverAcknowledgesOrPersistsAnEventInAnOriginatingTransactionThatRollsBackCases } from './audit.durable-audit-sqlite.fails-closed-on-disabled-capture-unsupported-domains-invalid-input-and-write-failure.behaviors.test-cases';
import { registerPersistsEveryRegisteredPluginActionLifecycleAndPreservesDeclaredDetailFieldCases } from './audit.durable-audit-sqlite.fails-closed-on-disabled-capture-unsupported-domains-invalid-input-and-write-failure.behaviors.test-cases';
import { registerPersistsProjectApiTokenAttributionOnlyWithAValidTokenContextCases } from './audit.durable-audit-sqlite.fails-closed-on-disabled-capture-unsupported-domains-invalid-input-and-write-failure.behaviors.test-cases';
import { registerPersistsProviderOriginSsoRoleDeltasAndFiltersThemByDomainCases } from './audit.durable-audit-sqlite.fails-closed-on-disabled-capture-unsupported-domains-invalid-input-and-write-failure.behaviors.test-cases';
import { registerPersistsResourceSystemAndDeviceOriginsHonorsSuppressionAndFiltersLifecycleCases } from './audit.durable-audit-sqlite.persists-resource-system-and-device-origins-honors-suppression-and-filters-lifecycle-.behaviors.test-cases';
import { registerPersistsValidatedSettingsAcrossStoreAndServiceRestartsAndFailsClosedOnReaCases } from './audit.durable-audit-sqlite.persists-resource-system-and-device-origins-honors-suppression-and-filters-lifecycle-.behaviors.test-cases';
import { registerPreservesSharedAuditRowsThroughIdentityDowngradeAndReUpgradeCases } from './audit.durable-audit-sqlite.preserves-shared-audit-rows-through-identity-downgrade-and-re-upgrade.test-cases';
import { registerRecordsABillingEventOnlyAfterItsOriginatingTransactionCommitsCases } from './audit.durable-audit-sqlite.persists-resource-system-and-device-origins-honors-suppression-and-filters-lifecycle-.behaviors.test-cases';
import { registerRecordsAllowlistedAdministrationMetadataAndRejectsCredentialBearingFieldsCases } from './audit.durable-audit-sqlite.persists-resource-system-and-device-origins-honors-suppression-and-filters-lifecycle-.behaviors.test-cases';
import { registerRecordsAnAnonymousIdentityEventWhenTheIdentityDomainIsEnabledCases } from './audit.durable-audit-sqlite.persists-resource-system-and-device-origins-honors-suppression-and-filters-lifecycle-.behaviors.test-cases';
import { registerRecordsAnEventAfterAPausedCleanupTransactionCommitsCases } from './audit.durable-audit-sqlite.persists-resource-system-and-device-origins-honors-suppression-and-filters-lifecycle-.behaviors.test-cases';
import { registerRecordsAndFiltersAttractapEventsRespectingGlobalAndDomainSuppressionCases } from './audit.durable-audit-sqlite.records-and-filters-attractap-events-respecting-global-and-domain-suppression.behaviors.test-cases';
import { registerRecordsBillingTransactionLifecycleEventsWithOnlyAllowlistedMetadataCases } from './audit.durable-audit-sqlite.records-and-filters-attractap-events-respecting-global-and-domain-suppression.behaviors.test-cases';
import { registerRecordsIdentityApiTokenAttributionCases } from './audit.durable-audit-sqlite.records-and-filters-attractap-events-respecting-global-and-domain-suppression.behaviors.test-cases';
import { registerRecordsProjectAdministrationEventsWithOnlySafeAllowlistedDetailsCases } from './audit.durable-audit-sqlite.records-and-filters-attractap-events-respecting-global-and-domain-suppression.behaviors.test-cases';
import { registerRecordsSystemOriginatedResourceIntroductionsWithoutASynthesizedSessionCases } from './audit.durable-audit-sqlite.records-and-filters-attractap-events-respecting-global-and-domain-suppression.behaviors.test-cases';
import { registerRecordsTheFinalDisablingSettingsChangeAndSuppressesSubsequentEventsJCases } from './audit.durable-audit-sqlite.records-and-filters-attractap-events-respecting-global-and-domain-suppression.behaviors.test-cases';
import { registerRejectsOversizedDetailsAtTheDatabaseBoundaryTooCases } from './audit.durable-audit-sqlite.records-and-filters-attractap-events-respecting-global-and-domain-suppression.behaviors.test-cases';
import { registerResolvesAuditFromAPluginContextRegisteredThroughFullPluginModuleForRootCases } from './audit.durable-audit-sqlite.resolves-audit-from-a-plugin-context-registered-through-full-plugin-module-for-root.test-cases';
import { registerResolvesTheSdkProviderThroughTheModuleAndActualBridgeCases } from './audit.durable-audit-sqlite.resolves-the-sdk-provider-through-the-module-and-actual-bridge.behaviors.test-cases';
import { registerRetainsBillingEventsFromACommittedSavepointWhenASiblingSavepointRollsBackCases } from './audit.durable-audit-sqlite.resolves-the-sdk-provider-through-the-module-and-actual-bridge.behaviors.test-cases';
import { registerRetainsOuterBillingEventsWhenANestedTransactionRollsBackCases } from './audit.durable-audit-sqlite.resolves-the-sdk-provider-through-the-module-and-actual-bridge.behaviors.test-cases';
import { registerDurableAuditSqliteFixture } from './audit.durable-audit-sqlite.test-fixture';
import { registerUpgradesAdditivelySurvivesConnectionRestartAndPrincipalDeletionPreventsUpdatCases } from './audit.durable-audit-sqlite.resolves-the-sdk-provider-through-the-module-and-actual-bridge.behaviors.test-cases';
import { registerUsesOneSafeEventSnapshotBeforeSettingsAwaitsAndWaitsSafelyForShutdownCases } from './audit.durable-audit-sqlite.resolves-the-sdk-provider-through-the-module-and-actual-bridge.behaviors.test-cases';
import { AuditService } from './audit.service';
describe('durable audit SQLite', () => {
  const fixture = registerDurableAuditSqliteFixture();
  registerRecordsTheFinalDisablingSettingsChangeAndSuppressesSubsequentEventsJCases(fixture);
  registerRecordsAllowlistedAdministrationMetadataAndRejectsCredentialBearingFieldsCases(fixture);
  registerUpgradesAdditivelySurvivesConnectionRestartAndPrincipalDeletionPreventsUpdatCases(fixture);
  registerPreservesSharedAuditRowsThroughIdentityDowngradeAndReUpgradeCases(fixture);
  registerNeverAcknowledgesOrPersistsAnEventInAnOriginatingTransactionThatRollsBackCases(fixture);
  registerRecordsBillingTransactionLifecycleEventsWithOnlyAllowlistedMetadataCases(fixture);
  registerRecordsProjectAdministrationEventsWithOnlySafeAllowlistedDetailsCases(fixture);
  registerPersistsProjectApiTokenAttributionOnlyWithAValidTokenContextCases(fixture);
  registerRecordsAndFiltersAttractapEventsRespectingGlobalAndDomainSuppressionCases(fixture);
  registerPersistsResourceSystemAndDeviceOriginsHonorsSuppressionAndFiltersLifecycleCases(fixture);
  registerRecordsABillingEventOnlyAfterItsOriginatingTransactionCommitsCases(fixture);
  registerDiscardsABillingEventWhenItsOriginatingTransactionRollsBackCases(fixture);
  registerRetainsOuterBillingEventsWhenANestedTransactionRollsBackCases(fixture);
  registerRetainsBillingEventsFromACommittedSavepointWhenASiblingSavepointRollsBackCases(fixture);
  registerPersistsEveryRegisteredPluginActionLifecycleAndPreservesDeclaredDetailFieldCases(fixture);
  registerFiltersAndPaginatesWithoutDuplicationHidesExpiredRowsAndCleansThemCases(fixture);
  registerDoesNotRollBackARecordedEventWhenAPausedCleanupTransactionFailsCases(fixture);
  registerRecordsAnEventAfterAPausedCleanupTransactionCommitsCases(fixture);
  registerFailsClosedOnDisabledCaptureUnsupportedDomainsInvalidInputAndWriteFailureCases(fixture);
  registerRecordsAnAnonymousIdentityEventWhenTheIdentityDomainIsEnabledCases(fixture);
  registerRecordsSystemOriginatedResourceIntroductionsWithoutASynthesizedSessionCases(fixture);
  registerRecordsIdentityApiTokenAttributionCases(fixture);
  registerPersistsProviderOriginSsoRoleDeltasAndFiltersThemByDomainCases(fixture);
  registerDoesNotPersistSsoEventsWhileTheSsoDomainIsDisabledCases(fixture);
  registerRejectsOversizedDetailsAtTheDatabaseBoundaryTooCases(fixture);
  registerBoundsOutstandingWritesWithoutAnUnboundedQueueCases(fixture);
  registerPersistsValidatedSettingsAcrossStoreAndServiceRestartsAndFailsClosedOnReaCases(fixture);
  registerAppliesRetentionSettingChangesToReadsImmediatelyAndRejectsMalformedPersisteCases(fixture);
  registerBoundsAdmissionBeforeSettingsAwaitsAndRecoversAfterSettingsFailureCases(fixture);
  registerDrainsMultipleBoundedRetentionBatchesAndFiltersEventPrefixesAndTimeWindowsCases(fixture);
  registerDeclinesWritesUnderSqliteContentionWithinADeadlineAndRecoversCases(fixture);
  registerEnforcesHttpSessionPermissionsTokenCeilingsQueryValidationAndPersistedSettiCases(fixture);
  registerUsesOneSafeEventSnapshotBeforeSettingsAwaitsAndWaitsSafelyForShutdownCases(fixture);
  registerResolvesAuditFromAPluginContextRegisteredThroughFullPluginModuleForRootCases(fixture);
  registerResolvesTheSdkProviderThroughTheModuleAndActualBridgeCases(fixture);
});
describe('audit authorization and query validation', () => {
  const fixture = registerAuditAuthorizationAndQueryValidationFixture();
  registerUsesTheEffectivePermissionGuardForBothSessionAndTokenCeilingsCases(fixture);
  registerValidatesAuditQueryBoundsAndAllowsTheRegisteredResourceAndBillingFiltersCases(fixture);
});

it('upgrades the full registered schema, reverts the audit migration, and reapplies it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'audit-upgrade-'));
  const prior = Object.values(migrations).filter(
    (migration) =>
      migration !== DurableAudit1783700000000 &&
      migration !== IdentityAudit1783800000000 &&
      migration !== RetirePasswordPolicyAudit1783900000000 &&
      migration !== migrations.AttractapAuditDomain1784000000000 &&
      migration !== migrations.FullAuditDomains1784100000000,
  );
  const database = join(directory, 'upgrade.sqlite');
  let source = new DataSource({ type: 'sqlite', database, entities: Object.values(entities), migrations: prior });
  try {
    await source.initialize();
    await source.runMigrations();
    await source.query(`INSERT INTO "password_policy_audit" ("event", "actorId", "actorUsername", "ip", "userAgent", "requestId", "before", "after", "changedFields")
      VALUES ('global_policy_updated', 1, 'migration-user', '127.0.0.1', 'migration-test', 'migration-request', '{"minLength":12}', '{"minLength":16}', '["minLength"]')`);
    const oversizedRequestId = 'r'.repeat(5_000);
    const oversizedBefore = JSON.stringify({ minLength: 12, requireUppercase: true });
    const oversizedAfter = JSON.stringify({ minLength: 16, requireUppercase: false });
    await source.query(
      `INSERT INTO "password_policy_audit" ("event", "actorId", "actorUsername", "ip", "userAgent", "requestId", "before", "after", "changedFields")
      VALUES ('global_policy_updated', 1, 'migration-user', '127.0.0.1', 'migration-test', ?, ?, ?, '["minLength"]')`,
      [oversizedRequestId, oversizedBefore, oversizedAfter],
    );
    await source.query(
      `INSERT INTO "setting" ("parent", "key", "value") VALUES ('audit', 'domains', '["billing","resource","demo-plugin"]')`,
    );
    await source.destroy();
    source = new DataSource({
      type: 'sqlite',
      database,
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    });
    await source.initialize();
    const applied = await source.runMigrations();
    expect(applied.map((migration) => migration.name)).toEqual([
      'DurableAudit1783700000000',
      'IdentityAudit1783800000000',
      'RetirePasswordPolicyAudit1783900000000',
      'AttractapAuditDomain1784000000000',
      'FullAuditDomains1784100000000',
    ]);
    expect(source.hasMetadata(AuditLog)).toBeTruthy();
    expect(await source.query('PRAGMA foreign_key_list(audit_log)')).toEqual([]);
    expect(await source.query(`SELECT "value" FROM "setting" WHERE "parent" = 'audit' AND "key" = 'domains'`)).toEqual([
      { value: '["billing","resource","identity","attractap","administration","project","sso"]' },
    ]);
    expect(await source.query("SELECT * FROM audit_log WHERE subjectType = 'identity.password_policy'")).toHaveLength(
      2,
    );
    expect(
      await source.query(`SELECT "metadata" FROM "password_policy_audit_overflow" WHERE "legacyAuditId" = 2`),
    ).toEqual([
      {
        metadata: JSON.stringify({
          actorUsername: 'migration-user',
          requestId: oversizedRequestId,
          role: null,
          before: oversizedBefore,
          after: oversizedAfter,
          changedFields: '["minLength"]',
        }),
      },
    ]);
    const migratedStore = new SettingsStoreService(source.getRepository(Setting), null);
    const migratedAudit = new AuditService(source, migratedStore);
    await migratedAudit.onModuleInit();
    const migratedList = await new AuditController(migratedAudit).list({ limit: 10 });
    const migratedOversizedEvent = migratedList.items.find((item) => item.details.legacyAuditId === 2);
    expect(migratedOversizedEvent).toMatchObject({
      details: {
        detailsTruncated: 1,
        actorUsername: 'migration-user',
        requestId: oversizedRequestId,
        before: oversizedBefore,
        after: oversizedAfter,
        changedFields: '["minLength"]',
      },
    });
    expect(migratedOversizedEvent?.operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    await expect(
      new ValidationPipe({ transform: true }).transform(
        { operationId: migratedOversizedEvent?.operationId },
        { type: 'query', metatype: AuditQueryDto },
      ),
    ).resolves.toMatchObject({ operationId: migratedOversizedEvent?.operationId });
    const now = jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-16T12:00:00.000Z').getTime());
    await source.query(`INSERT INTO "password_policy_audit_overflow" ("legacyAuditId", "metadata")
      VALUES (999, '{"actorUsername":"expired-user"}')`);
    await source.query(`INSERT INTO "audit_log" ("at", "domain", "action", "operationId", "outcome", "subjectType", "subjectId", "details")
      VALUES ('2026-06-15 11:00:00.000', 'identity', 'identity.password_policy_updated', 'password-policy-audit-999', 'succeeded', 'identity.password_policy', 1,
         '{"migrationSource":"password_policy_audit","legacyAuditId":999,"detailsTruncated":true}')`);
    await source.query(`INSERT INTO "password_policy_audit_overflow" ("legacyAuditId", "metadata")
      VALUES (998, '{"actorUsername":"retained-user"}')`);
    await source.query(`INSERT INTO "audit_log" ("at", "domain", "action", "operationId", "outcome", "subjectType", "subjectId", "details")
      VALUES ('2026-06-15 13:00:00.000', 'identity', 'identity.password_policy_updated', 'e3aedfb1-15c7-4290-9a0c-777f27a8357f', 'succeeded', 'identity.password_policy', 1,
        '{"migrationSource":"password_policy_audit","legacyAuditId":998,"detailsTruncated":true}')`);
    await migratedStore.setPlainSetting('audit', 'retention_days', '1');
    await source.query(`CREATE TRIGGER abort_audit_cleanup BEFORE DELETE ON "audit_log"
      WHEN OLD.id IN (SELECT id FROM "audit_log" WHERE "at" < '2026-06-15 12:00:00.000')
      BEGIN SELECT RAISE(ABORT, 'audit cleanup failed'); END`);
    await migratedAudit.cleanup();
    expect(await source.query('SELECT * FROM password_policy_audit_overflow WHERE legacyAuditId = 999')).toHaveLength(
      1,
    );
    await source.query('DROP TRIGGER abort_audit_cleanup');
    await migratedAudit.cleanup();
    expect(await source.query('SELECT * FROM password_policy_audit_overflow WHERE legacyAuditId = 999')).toEqual([]);
    expect(await source.query('SELECT * FROM password_policy_audit_overflow WHERE legacyAuditId = 998')).toHaveLength(
      1,
    );
    now.mockRestore();
    await migratedAudit.onModuleDestroy();
    await source.query(`INSERT INTO "audit_log" ("at", "domain", "action", "operationId", "outcome", "subjectType", "subjectId", "details")
      VALUES (datetime('now'), 'identity', 'identity.password_policy_updated', 'f4ae9dd5-3b66-4d5e-a46c-03cfaa25e266', 'succeeded', 'identity.password_policy', 1, '{"field":"minLength"}')`);
    await source.query(`UPDATE "setting" SET "value" = '["identity"]'
      WHERE "parent" = 'audit' AND "key" = 'domains'`);
    await source.undoLastMigration();
    await source.undoLastMigration();
    await source.undoLastMigration();
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toHaveLength(1);
    expect(await source.query('SELECT * FROM password_policy_audit')).toHaveLength(4);
    expect(
      await source.query(
        `SELECT "actorUsername", "requestId", "before", "after", "changedFields" FROM password_policy_audit WHERE "requestId" = 'migration-request'`,
      ),
    ).toEqual([
      {
        actorUsername: 'migration-user',
        requestId: 'migration-request',
        before: '{"minLength":12}',
        after: '{"minLength":16}',
        changedFields: '["minLength"]',
      },
    ]);
    expect(
      await source.query(`SELECT "requestId", "before", "after" FROM password_policy_audit WHERE "requestId" = ?`, [
        oversizedRequestId,
      ]),
    ).toEqual([{ requestId: oversizedRequestId, before: oversizedBefore, after: oversizedAfter }]);
    expect(await source.query("SELECT * FROM audit_log WHERE subjectType = 'identity.password_policy'")).toHaveLength(
      0,
    );
    expect(await source.query(`SELECT "value" FROM "setting" WHERE "parent" = 'audit' AND "key" = 'domains'`)).toEqual([
      { value: '[]' },
    ]);
    expect((await source.runMigrations()).map((migration) => migration.name)).toEqual([
      'RetirePasswordPolicyAudit1783900000000',
      'AttractapAuditDomain1784000000000',
      'FullAuditDomains1784100000000',
    ]);
    expect(await source.query("SELECT * FROM audit_log WHERE subjectType = 'identity.password_policy'")).toHaveLength(
      4,
    );
    await source.undoLastMigration();
    await source.undoLastMigration();
    await source.undoLastMigration();
    expect(
      await source.query(`SELECT "requestId", "before", "after" FROM password_policy_audit WHERE "requestId" = ?`, [
        oversizedRequestId,
      ]),
    ).toEqual([{ requestId: oversizedRequestId, before: oversizedBefore, after: oversizedAfter }]);
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toHaveLength(1);
    await source.undoLastMigration();
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toHaveLength(1);
    await source.undoLastMigration();
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toEqual([]);
    expect((await source.runMigrations()).map((migration) => migration.name)).toEqual([
      'DurableAudit1783700000000',
      'IdentityAudit1783800000000',
      'RetirePasswordPolicyAudit1783900000000',
      'AttractapAuditDomain1784000000000',
      'FullAuditDomains1784100000000',
    ]);
  } finally {
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
