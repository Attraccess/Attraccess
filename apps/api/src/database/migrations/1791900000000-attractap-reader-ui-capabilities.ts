import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapReaderUiCapabilities1791900000000 implements MigrationInterface {
  name = 'AttractapReaderUiCapabilities1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "firmwareCapabilitiesUi" text`);
    await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "firmwareCapabilitiesResetreason" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN "firmwareCapabilitiesResetreason"`);
    await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN "firmwareCapabilitiesUi"`);
  }
}
