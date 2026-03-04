import { MigrationInterface, QueryRunner } from 'typeorm';

const APP_PARENT = 'app';
const COOKIE_SAME_SITE_KEY = 'cookie_same_site';

export class RemoveCookieSameSiteSetting1772618000000 implements MigrationInterface {
  name = 'RemoveCookieSameSiteSetting1772618000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "setting" WHERE "parent" = ? AND "key" = ?`,
      [APP_PARENT, COOKIE_SAME_SITE_KEY],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query(
      `SELECT COUNT(*) as count FROM "setting" WHERE "parent" = ? AND "key" = ?`,
      [APP_PARENT, COOKIE_SAME_SITE_KEY],
    );
    if (Number(existing[0].count) === 0) {
      await queryRunner.query(
        `INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)`,
        [APP_PARENT, COOKIE_SAME_SITE_KEY, 'lax'],
      );
    }
  }
}
