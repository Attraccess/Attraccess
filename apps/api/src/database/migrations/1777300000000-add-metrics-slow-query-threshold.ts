// Seed default DB-configurable slow query threshold for metrics instrumentation
// FEATURE: Metrics — DB/UI configurable slow query threshold
import { MigrationInterface, QueryRunner } from 'typeorm';

const PARENT = 'metrics';
const KEY = 'slow_query_threshold_seconds';
const DEFAULT_VALUE = '0.5';

export class AddMetricsSlowQueryThreshold1777300000000 implements MigrationInterface {
  name = 'AddMetricsSlowQueryThreshold1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query(
      `SELECT COUNT(*) as count FROM "setting" WHERE "parent" = ? AND "key" = ?`,
      [PARENT, KEY],
    );
    if (Number(existing[0].count) === 0) {
      await queryRunner.query(`INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)`, [
        PARENT,
        KEY,
        DEFAULT_VALUE,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "setting" WHERE "parent" = ? AND "key" = ?`, [PARENT, KEY]);
  }
}
