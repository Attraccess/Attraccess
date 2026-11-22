import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Machine-list visibility (ATT-843) is an explicit setting. A missing value means "permitted-only", the restrictive
 * mode a fresh installation gets. An instance that already has accounts keeps today's behaviour ("authenticated")
 * until an admin changes it, so this stores that value once, and never overwrites one that is there.
 *
 * Instances upgraded from SQLite already have their accounts here: the import runs earlier, as 1760000000001.
 * A fresh installation has no account at this point; the first-time setup creates the first one later.
 */
export class ResourceListVisibility1796200000000 implements MigrationInterface {
  name = 'ResourceListVisibility1796200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "setting" ("parent", "key", "value")
       SELECT 'resources', 'list_visibility', 'authenticated'
       WHERE EXISTS (SELECT 1 FROM "user")
       ON CONFLICT ("parent", "key") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "setting" WHERE "parent" = 'resources' AND "key" = 'list_visibility' AND "value" = 'authenticated'`,
    );
  }
}
