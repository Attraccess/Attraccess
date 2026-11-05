import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttractapReaderUiCapabilities1792100000000 implements MigrationInterface {
  name = 'AttractapReaderUiCapabilities1792100000000';

  // Skips columns that exist: dev databases may have run this migration under its earlier 1791900000000 name.
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of ['firmwareCapabilitiesUi', 'firmwareCapabilitiesResetreason']) {
      if (await queryRunner.hasColumn('attractap', column)) continue;
      await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "${column}" text`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN "firmwareCapabilitiesResetreason"`);
    await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN "firmwareCapabilitiesUi"`);
  }
}
