import { MigrationInterface, QueryRunner } from 'typeorm';

/** Access-only doors (ATT-1307): a door whose only action is Open, recorded as a door unlock. */
export class DoorAccessOnly1793750000000 implements MigrationInterface {
  name = 'DoorAccessOnly1793750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" ADD COLUMN "accessOnly" boolean NOT NULL DEFAULT (0)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "accessOnly"`);
  }
}
