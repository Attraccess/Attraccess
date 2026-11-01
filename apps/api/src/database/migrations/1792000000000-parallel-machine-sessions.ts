import { MigrationInterface, QueryRunner } from 'typeorm';

// Same predicate as activeUsageSql('x'); copied so this migration never changes if that helper does.
const published = (alias: string) =>
  `${alias}.endTime IS NULL AND ${alias}.usageAction = 'usage' AND ${alias}.isFinalized = 1 AND ${alias}.lifecyclePending = 0`;

export class ParallelMachineSessions1792000000000 implements MigrationInterface {
  name = 'ParallelMachineSessions1792000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" ADD COLUMN "maxParallelSessions" integer NOT NULL DEFAULT 1`);

    // Capacity is enforced by the serialized lifecycle transaction. The database keeps the
    // per-person guarantee: at most one published session per (resource, user). Legacy duplicates
    // are preserved for an operator to resolve, so this stays a trigger instead of a unique index.
    for (const operation of ['insert', 'update']) {
      await queryRunner.query(`DROP TRIGGER resource_usage_single_active_${operation}`);
    }
    for (const operation of ['INSERT', 'UPDATE']) {
      await queryRunner.query(`CREATE TRIGGER resource_usage_single_active_per_user_${operation.toLowerCase()}
        AFTER ${operation} ON resource_usage
        WHEN ${published('NEW')}
        ${operation === 'UPDATE' ? `AND (NOT (${published('OLD')}) OR OLD.resourceId != NEW.resourceId OR OLD.userId IS NOT NEW.userId)` : ''}
        AND EXISTS (
          SELECT 1 FROM resource_usage other
          WHERE other.resourceId = NEW.resourceId AND other.userId IS NEW.userId
            AND other.id != NEW.id AND ${published('other')}
        )
        BEGIN SELECT RAISE(ABORT, 'User already has an active usage session on this resource'); END`);
    }

    await queryRunner.query('DROP INDEX IDX_resource_usage_pending_resource');
    await queryRunner.query(`CREATE UNIQUE INDEX IDX_resource_usage_pending_resource_user
      ON resource_usage (resourceId, userId) WHERE lifecyclePending = 1 AND endTime IS NULL`);

    await queryRunner.query('DROP INDEX "IDX_resource_usage_lifecycle_attempt_resource"');
    await queryRunner.query(
      'CREATE INDEX "IDX_resource_usage_lifecycle_attempt_resource" ON "resource_usage_lifecycle_attempt" ("resourceId")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_resource_usage_lifecycle_attempt_candidate" ON "resource_usage_lifecycle_attempt" ("candidateUsageId")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_resource_usage_lifecycle_attempt_previous" ON "resource_usage_lifecycle_attempt" ("previousUsageId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Several attempts or sessions per resource cannot be represented by the single-session schema.
    await queryRunner.query('DELETE FROM "resource_usage_lifecycle_attempt"');
    await queryRunner.query('DROP INDEX "IDX_resource_usage_lifecycle_attempt_previous"');
    await queryRunner.query('DROP INDEX "IDX_resource_usage_lifecycle_attempt_candidate"');
    await queryRunner.query('DROP INDEX "IDX_resource_usage_lifecycle_attempt_resource"');
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_resource_usage_lifecycle_attempt_resource" ON "resource_usage_lifecycle_attempt" ("resourceId")',
    );

    await queryRunner.query('DELETE FROM resource_usage WHERE lifecyclePending = 1 AND endTime IS NULL');
    await queryRunner.query('DROP INDEX IDX_resource_usage_pending_resource_user');
    await queryRunner.query(`CREATE UNIQUE INDEX IDX_resource_usage_pending_resource
      ON resource_usage (resourceId) WHERE lifecyclePending = 1 AND endTime IS NULL`);

    for (const operation of ['insert', 'update']) {
      await queryRunner.query(`DROP TRIGGER resource_usage_single_active_per_user_${operation}`);
    }
    for (const operation of ['INSERT', 'UPDATE']) {
      await queryRunner.query(`CREATE TRIGGER resource_usage_single_active_${operation.toLowerCase()}
        AFTER ${operation} ON resource_usage
        WHEN ${published('NEW')}
        ${operation === 'UPDATE' ? `AND (NOT (${published('OLD')}) OR OLD.resourceId != NEW.resourceId)` : ''}
        AND EXISTS (
          SELECT 1 FROM resource_usage other
          WHERE other.resourceId = NEW.resourceId AND other.id != NEW.id AND ${published('other')}
        )
        BEGIN SELECT RAISE(ABORT, 'Resource already has an active usage session'); END`);
    }
    await queryRunner.query('ALTER TABLE "resource" DROP COLUMN "maxParallelSessions"');
  }
}
