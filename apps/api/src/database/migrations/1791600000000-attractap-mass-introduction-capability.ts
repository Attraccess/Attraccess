import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapMassIntroductionCapability1791600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attractap" ADD COLUMN "firmwareCapabilitiesMassintroduction" boolean NOT NULL DEFAULT (0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN "firmwareCapabilitiesMassintroduction"`);
  }
}
