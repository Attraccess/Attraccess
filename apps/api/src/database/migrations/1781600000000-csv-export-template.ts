import { MigrationInterface, QueryRunner } from 'typeorm';

export class CsvExportTemplate1781600000000 implements MigrationInterface {
  name = 'CsvExportTemplate1781600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "csv_export_template" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" text NOT NULL,
        "exportType" text NOT NULL,
        "columns" json NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "csv_export_template_name_per_type" UNIQUE ("exportType", "name")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "csv_export_template"`);
  }
}
