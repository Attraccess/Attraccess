import { MigrationInterface, QueryRunner } from 'typeorm';

export class BillingFactor1759918355010 implements MigrationInterface {
  name = 'BillingFactor1759918355010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE user ADD COLUMN "billingFactor" integer NOT NULL DEFAULT (100);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE user DROP COLUMN "billingFactor";`);
  }
}
