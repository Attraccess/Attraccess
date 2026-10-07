import { ResourceUsage } from '@attraccess/database-entities';
import { ResourceUsageIntegrity1790100000000 } from '../../database/migrations/1790100000000-resource-usage-integrity';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsNeverRepairsHistoryWithoutItsAuditJournalAndRetainsEvidenceOnDowngrade(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it('never repairs history without its audit journal and retains evidence on downgrade', async () => {
    const orphan = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      isFinalized: false,
      lifecyclePending: false,
    });
    await scope.source.query(`CREATE TRIGGER reject_recovery_audit BEFORE INSERT ON resource_usage_recovery
      BEGIN SELECT RAISE(ABORT, 'journal unavailable'); END`);
    await expect(scope.usage.recoverInterruptedLifecycles()).rejects.toThrow('journal unavailable');
    expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toEqual(orphan);
    await scope.source.query('DROP TRIGGER reject_recovery_audit');
    await scope.migrateIntegrity();
    const journal = await scope.source.query('SELECT * FROM resource_usage_recovery');
    const runner = scope.source.createQueryRunner();
    try {
      await new ResourceUsageIntegrity1790100000000().down(runner);
    } finally {
      await runner.release();
    }
    expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual(journal);
    expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toMatchObject({
      endTime: orphan.startTime,
      isFinalized: false,
    });
  });
}
