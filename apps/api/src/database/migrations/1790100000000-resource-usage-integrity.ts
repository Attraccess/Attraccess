import { MigrationInterface, QueryRunner } from 'typeorm';
import { recoverOrphanedUsages, USAGE_RECOVERY_TABLE_SQL } from '../resource-usage-integrity';
import { activeUsageSql } from '../../resources/usage/active-usage';

export class ResourceUsageIntegrity1790100000000 implements MigrationInterface {
  name = 'ResourceUsageIntegrity1790100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(USAGE_RECOVERY_TABLE_SQL);
    await recoverOrphanedUsages(queryRunner);

    // Triggers enforce the CHECK-equivalent without rebuilding a table with generated
    // duration columns, views, and form/billing foreign keys.
    for (const operation of ['INSERT', 'UPDATE']) {
      await queryRunner.query(`CREATE TRIGGER resource_usage_valid_open_${operation.toLowerCase()}
        BEFORE ${operation} ON resource_usage
        WHEN NEW.endTime IS NULL AND NEW.isFinalized = 0 AND NEW.lifecyclePending = 0
        BEGIN SELECT RAISE(ABORT, 'Open usage must be finalized or lifecycle-pending'); END`);
    }

    // Preserve legacy duplicate real sessions for an operator to resolve. Enforce
    // uniqueness for all new writes without arbitrarily cancelling either session.
    for (const operation of ['INSERT', 'UPDATE']) {
      await queryRunner.query(`CREATE TRIGGER resource_usage_single_active_${operation.toLowerCase()}
        AFTER ${operation} ON resource_usage
        WHEN ${activeUsageSql('NEW')}
        ${operation === 'UPDATE' ? `AND (NOT (${activeUsageSql('OLD')}) OR OLD.resourceId != NEW.resourceId)` : ''}
        AND EXISTS (
          SELECT 1 FROM resource_usage other
          WHERE other.resourceId = NEW.resourceId AND other.id != NEW.id AND ${activeUsageSql('other')}
        )
        BEGIN SELECT RAISE(ABORT, 'Resource already has an active usage session'); END`);
    }
    // A takeover legitimately reserves a candidate alongside the outgoing active session.
    await queryRunner.query(`CREATE UNIQUE INDEX IDX_resource_usage_pending_resource
      ON resource_usage (resourceId) WHERE lifecyclePending = 1 AND endTime IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const operation of ['insert', 'update']) {
      await queryRunner.query(`DROP TRIGGER resource_usage_valid_open_${operation}`);
      await queryRunner.query(`DROP TRIGGER resource_usage_single_active_${operation}`);
    }
    await queryRunner.query('DROP INDEX IDX_resource_usage_pending_resource');
    // Keep the recovery journal and cancelled history on downgrade; the unknown state cannot be restored safely.
  }
}
