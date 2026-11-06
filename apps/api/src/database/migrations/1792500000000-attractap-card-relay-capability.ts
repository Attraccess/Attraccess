import { MigrationInterface, QueryRunner } from 'typeorm';

const COLUMN = 'firmwareCapabilitiesCardrelay';

export class AttractapCardRelayCapability1792500000000 implements MigrationInterface {
  name = 'AttractapCardRelayCapability1792500000000';

  // Skips an existing column: dev and lab databases may have run this migration under an earlier name.
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('attractap', COLUMN)) return;
    await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "${COLUMN}" boolean NOT NULL DEFAULT (0)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('attractap', COLUMN))) return;
    await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN "${COLUMN}"`);
  }
}
