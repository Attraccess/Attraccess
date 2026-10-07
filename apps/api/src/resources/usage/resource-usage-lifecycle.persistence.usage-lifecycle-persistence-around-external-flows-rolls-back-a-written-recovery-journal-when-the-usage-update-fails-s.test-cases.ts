import { ResourceUsage } from '@attraccess/database-entities';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ResourceUsageIntegrity1790100000000 } from '../../database/migrations/1790100000000-resource-usage-integrity';
import { dataSourceConfig } from '../../database/datasource';
import { UsageLifecyclePersistenceAroundExternalFlowsTestScope } from './resource-usage-lifecycle.persistence.spec';
export function registerUsageLifecyclePersistenceAroundExternalFlowsRollsBackAWrittenRecoveryJournalWhenTheUsageUpdateFailsS(
  scope: UsageLifecyclePersistenceAroundExternalFlowsTestScope,
): void {
  it.each(['startup', 'upgrade migration'])(
    'rolls back a written recovery journal when the usage update fails (%s)',
    async (recoveryPath) => {
      const orphan = await scope.source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        startTime: new Date('2026-09-23T14:00:40Z'),
        startNotes: 'DEMO: ongoing laboratory run',
        endNotes: 'Original note',
        attributedOperatingDurationInMinutes: 17,
        isFinalized: false,
        lifecyclePending: false,
      });
      const before = await scope.publishedState();
      const journalBefore = await scope.source.query('SELECT * FROM resource_usage_recovery');
      // This failure proves the journal INSERT succeeded within the recovery transaction.
      await scope.source.query(`CREATE TRIGGER reject_recovery_update BEFORE UPDATE ON resource_usage
        WHEN OLD.id = ${orphan.id}
        BEGIN
          SELECT CASE WHEN EXISTS (SELECT 1 FROM resource_usage_recovery WHERE usageId = OLD.id)
            THEN RAISE(ABORT, 'usage update rejected after journal insert')
            ELSE RAISE(ABORT, 'recovery journal missing before update') END;
        END`);

      // Retain the production automatic migration runner and its transaction configuration.
      const upgrade = new DataSource({
        ...dataSourceConfig,
        database: scope.source.options.database,
        entities: scope.schemas,
        migrations: [ResourceUsageIntegrity1790100000000],
      } as DataSourceOptions);
      try {
        const recover = () =>
          recoveryPath === 'startup' ? scope.usage.recoverInterruptedLifecycles() : upgrade.initialize();
        await expect(recover()).rejects.toThrow('usage update rejected after journal insert');
        expect(await scope.publishedState()).toEqual(before);
        expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual(journalBefore);
        if (recoveryPath === 'upgrade migration') {
          expect(await scope.source.query('SELECT * FROM migrations')).toEqual([]);
        }

        await scope.source.query('DROP TRIGGER reject_recovery_update');
        await recover();
        expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toMatchObject({
          endTime: orphan.startTime,
          isFinalized: false,
          attributedOperatingDurationInMinutes: 0,
        });
        expect(await scope.source.query('SELECT usageId FROM resource_usage_recovery')).toEqual([
          { usageId: orphan.id },
        ]);
      } finally {
        if (upgrade.isInitialized) await upgrade.destroy();
      }
    },
  );
}
