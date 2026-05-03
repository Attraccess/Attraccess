// Seed default per-subsystem metrics toggles into the setting table
// FEATURE: Metrics — runtime control over per-subsystem timing instrumentation
import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  METRICS_TOGGLE_DEFAULTS,
  METRICS_TOGGLE_KEYS,
  MetricsSubsystem,
} from '../../settings/constants';

const PARENT = 'app';

export class AddMetricsSubsystemToggles1775000000000 implements MigrationInterface {
  name = 'AddMetricsSubsystemToggles1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const subsystems = Object.keys(METRICS_TOGGLE_KEYS) as MetricsSubsystem[];
    for (const subsystem of subsystems) {
      const settingKey = METRICS_TOGGLE_KEYS[subsystem];
      const defaultValue = METRICS_TOGGLE_DEFAULTS[subsystem] ? 'true' : 'false';
      const existing = await queryRunner.query(
        `SELECT COUNT(*) as count FROM "setting" WHERE "parent" = ? AND "key" = ?`,
        [PARENT, settingKey],
      );
      if (Number(existing[0].count) === 0) {
        await queryRunner.query(
          `INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)`,
          [PARENT, settingKey, defaultValue],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const subsystems = Object.keys(METRICS_TOGGLE_KEYS) as MetricsSubsystem[];
    for (const subsystem of subsystems) {
      const settingKey = METRICS_TOGGLE_KEYS[subsystem];
      await queryRunner.query(
        `DELETE FROM "setting" WHERE "parent" = ? AND "key" = ?`,
        [PARENT, settingKey],
      );
    }
  }
}
