import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserLocale1782400000000 implements MigrationInterface {
  name = 'UserLocale1782400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "locale" varchar(10) NOT NULL DEFAULT 'en'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "locale"`);
  }
}
