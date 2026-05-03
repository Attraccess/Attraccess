// Seed default per-subsystem metrics toggles into the setting table
// FEATURE: Metrics — runtime control over per-subsystem timing instrumentation
import { MigrationInterface, QueryRunner } from 'typeorm';

const PARENT = 'app';

const ENTRIES: Array<{ key: string; value: string }> = [
  { key: 'metrics_http_enabled', value: 'true' },
  { key: 'metrics_ws_enabled', value: 'true' },
  { key: 'metrics_cron_enabled', value: 'true' },
  { key: 'metrics_db_enabled', value: 'false' },
  { key: 'metrics_external_enabled', value: 'true' },
  { key: 'metrics_sse_enabled', value: 'true' },
  { key: 'metrics_flow_enabled', value: 'true' },
];

export class AddMetricsSubsystemToggles1775000000000 implements MigrationInterface {
  name = 'AddMetricsSubsystemToggles1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const entry of ENTRIES) {
      const existing = await queryRunner.query(
        `SELECT COUNT(*) as count FROM "setting" WHERE "parent" = ? AND "key" = ?`,
        [PARENT, entry.key],
      );
      if (Number(existing[0].count) === 0) {
        await queryRunner.query(
          `INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)`,
          [PARENT, entry.key, entry.value],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const entry of ENTRIES) {
      await queryRunner.query(
        `DELETE FROM "setting" WHERE "parent" = ? AND "key" = ?`,
        [PARENT, entry.key],
      );
    }
  }
}
