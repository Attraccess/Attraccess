import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapCardRelayCapability1791900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "attractap" ADD COLUMN "firmwareCapabilitiesCardrelay" boolean NOT NULL DEFAULT (0)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "attractap" DROP COLUMN "firmwareCapabilitiesCardrelay"');
  }
}
