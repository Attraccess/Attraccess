import { MigrationInterface, QueryRunner } from 'typeorm';

/** Keep secured reader IDs and their credential history reserved permanently. */
export class PreserveReaderKeyOwnership1792300000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TRIGGER "TR_reader_identity_preserve_reader"
      BEFORE DELETE ON "attractap"
      WHEN EXISTS (SELECT 1 FROM "attractap_reader_identity" WHERE "readerId" = OLD."id")
      BEGIN SELECT RAISE(ABORT, 'Enrolled readers must be revoked instead of deleted'); END`);
    await runner.query(`CREATE TRIGGER "TR_reader_identity_preserve_history"
      BEFORE DELETE ON "attractap_reader_identity"
      BEGIN SELECT RAISE(ABORT, 'Reader key ownership history cannot be deleted'); END`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TRIGGER "TR_reader_identity_preserve_history"');
    await runner.query('DROP TRIGGER "TR_reader_identity_preserve_reader"');
  }
}
