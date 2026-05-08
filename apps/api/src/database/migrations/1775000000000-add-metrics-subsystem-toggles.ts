// Seed default per-subsystem metrics toggles into the setting table
// FEATURE: Metrics — runtime control over per-subsystem timing instrumentation
import { MigrationInterface, QueryRunner } from 'typeorm';

const PARENT = 'metrics';

const SUBSYSTEM_DEFAULTS: ReadonlyArray<readonly [string, boolean]> = [
  ['metrics_http_enabled', true],
  ['metrics_ws_enabled', true],
  ['metrics_cron_enabled', true],
  ['metrics_db_enabled', false],
  ['metrics_external_enabled', true],
  ['metrics_sse_enabled', true],
  ['metrics_flow_enabled', true],
];

export class AddMetricsSubsystemToggles1775000000000 implements MigrationInterface {
  name = 'AddMetricsSubsystemToggles1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [settingKey, defaultEnabled] of SUBSYSTEM_DEFAULTS) {
      const defaultValue = defaultEnabled ? 'true' : 'false';
      const existing = await queryRunner.query(
        `SELECT COUNT(*) as count FROM "setting" WHERE "parent" = ? AND "key" = ?`,
        [PARENT, settingKey],
      );
      if (Number(existing[0].count) === 0) {
        await queryRunner.query(`INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)`, [
          PARENT,
          settingKey,
          defaultValue,
        ]);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [settingKey] of SUBSYSTEM_DEFAULTS) {
      await queryRunner.query(`DELETE FROM "setting" WHERE "parent" = ? AND "key" = ?`, [PARENT, settingKey]);
    }
  }
}
