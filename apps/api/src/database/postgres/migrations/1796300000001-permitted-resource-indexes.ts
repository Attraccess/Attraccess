import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes for the "permitted-only" machine list (ATT-843). The rule asks, for every machine row, whether the viewer
 * introduces it and whether the latest history entry of one of the viewer's introductions is a grant. Without these
 * indexes both checks scan the whole table once per machine.
 */
export class PermittedResourceIndexes1796300000001 implements MigrationInterface {
  name = 'PermittedResourceIndexes1796300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_resource_introduction_history_item_latest" ON "resource_introduction_history_item" ("introductionId", "createdAt", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_resource_introducer_user" ON "resource_introducer" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_introducer_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_introduction_history_item_latest"`);
  }
}
