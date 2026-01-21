import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSoftDelete1768741974728 implements MigrationInterface {
  name = 'AddUserSoftDelete1768741974728';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "deletedAt" datetime`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "deleteAccountToken" text`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "deleteAccountTokenExpiresAt" datetime`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "deleteAccountRequestedAt" datetime`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "deletedAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "deleteAccountToken"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "deleteAccountTokenExpiresAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "deleteAccountRequestedAt"`);
  }
}
