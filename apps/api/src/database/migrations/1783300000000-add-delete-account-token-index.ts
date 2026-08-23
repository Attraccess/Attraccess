import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeleteAccountTokenIndex1783300000000 implements MigrationInterface {
  name = 'AddDeleteAccountTokenIndex1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_deleteAccountToken" ON "user" ("deleteAccountToken")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_deleteAccountToken"`);
  }
}
