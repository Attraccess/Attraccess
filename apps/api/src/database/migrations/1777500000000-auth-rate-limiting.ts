import { MigrationInterface, QueryRunner } from 'typeorm';

const PARENT = 'auth';

const RATE_LIMIT_DEFAULTS: ReadonlyArray<readonly [string, string]> = [
  ['rate_limit_max_attempts', '5'],
  ['rate_limit_window_seconds', '900'],
  ['rate_limit_lockout_duration_seconds', '900'],
  ['rate_limit_exponential_backoff', 'false'],
  ['rate_limit_backoff_multiplier', '2'],
];

export class AuthRateLimiting1777500000000 implements MigrationInterface {
  name = 'AuthRateLimiting1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "lockedUntil" datetime`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "failedLoginAttempts" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "firstFailedLoginAt" datetime`);

    for (const [key, value] of RATE_LIMIT_DEFAULTS) {
      const existing = await queryRunner.query(
        `SELECT COUNT(*) as count FROM "setting" WHERE "parent" = ? AND "key" = ?`,
        [PARENT, key],
      );
      if (Number(existing[0].count) === 0) {
        await queryRunner.query(`INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)`, [
          PARENT,
          key,
          value,
        ]);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [key] of RATE_LIMIT_DEFAULTS) {
      await queryRunner.query(`DELETE FROM "setting" WHERE "parent" = ? AND "key" = ?`, [PARENT, key]);
    }
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "firstFailedLoginAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "failedLoginAttempts"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "lockedUntil"`);
  }
}
