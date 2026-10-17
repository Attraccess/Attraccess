import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserDateTimePreferences1791400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "dateFormat" varchar(20) NOT NULL DEFAULT 'language'`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "timeFormat" varchar(10) NOT NULL DEFAULT '24-hour'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "timeFormat"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "dateFormat"`);
  }
}
