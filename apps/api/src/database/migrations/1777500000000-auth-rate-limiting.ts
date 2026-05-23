import { MigrationInterface, QueryRunner } from 'typeorm';
import { AUTH_KEYS, AUTH_PARENT, RATE_LIMIT_DEFAULTS } from '../../settings/constants';

const SEED_ENTRIES: ReadonlyArray<readonly [string, string]> = [
  [AUTH_KEYS.rateLimitMaxAttempts, String(RATE_LIMIT_DEFAULTS.maxAttempts)],
  [AUTH_KEYS.rateLimitWindowSeconds, String(RATE_LIMIT_DEFAULTS.windowSeconds)],
  [AUTH_KEYS.rateLimitLockoutDurationSeconds, String(RATE_LIMIT_DEFAULTS.lockoutDurationSeconds)],
  [AUTH_KEYS.rateLimitExponentialBackoff, RATE_LIMIT_DEFAULTS.exponentialBackoff ? 'true' : 'false'],
  [AUTH_KEYS.rateLimitBackoffMultiplier, String(RATE_LIMIT_DEFAULTS.backoffMultiplier)],
];

export class AuthRateLimiting1777500000000 implements MigrationInterface {
  name = 'AuthRateLimiting1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "lockedUntil" datetime`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "failedLoginAttempts" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "firstFailedLoginAt" datetime`);

    for (const [key, value] of SEED_ENTRIES) {
      const existing = await queryRunner.query(
        `SELECT COUNT(*) as count FROM "setting" WHERE "parent" = ? AND "key" = ?`,
        [AUTH_PARENT, key],
      );
      if (Number(existing[0].count) === 0) {
        await queryRunner.query(`INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)`, [
          AUTH_PARENT,
          key,
          value,
        ]);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [key] of SEED_ENTRIES) {
      await queryRunner.query(`DELETE FROM "setting" WHERE "parent" = ? AND "key" = ?`, [AUTH_PARENT, key]);
    }
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "firstFailedLoginAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "failedLoginAttempts"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "lockedUntil"`);
  }
}
