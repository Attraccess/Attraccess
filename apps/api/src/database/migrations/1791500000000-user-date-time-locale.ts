import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserDateTimeLocale1791500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "dateTimeLocale" varchar(255) DEFAULT NULL`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "dateFormat"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "timeFormat"`);
  }

  // Rollback removes custom locales, restoring the draft's defaults while retaining users.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "dateFormat" varchar(20) NOT NULL DEFAULT 'language'`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "timeFormat" varchar(10) NOT NULL DEFAULT '24-hour'`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "dateTimeLocale"`);
  }
}
