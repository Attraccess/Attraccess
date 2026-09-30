import { MigrationInterface, QueryRunner } from 'typeorm';

const RESOURCE_REPORTS_EXPORT_PERMISSION = 'resources.reports.export';

export class ResourceReportsExportPermission1783500000000 implements MigrationInterface {
  name = 'ResourceReportsExportPermission1783500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT OR IGNORE INTO "permission" ("key", "label", "description", "category") VALUES (?, ?, ?, ?)`,
      [
        RESOURCE_REPORTS_EXPORT_PERMISSION,
        'Export Resource Reports',
        'Allows exporting resource session and operating duration reports',
        'resources',
      ],
    );
    await queryRunner.query(
      `INSERT OR IGNORE INTO "role_permission" ("roleId", "permissionKey")
       SELECT "id", ? FROM "role" WHERE "key" = 'administrator'`,
      [RESOURCE_REPORTS_EXPORT_PERMISSION],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permission" WHERE "permissionKey" = ?`, [RESOURCE_REPORTS_EXPORT_PERMISSION]);
    await queryRunner.query(`DELETE FROM "permission" WHERE "key" = ?`, [RESOURCE_REPORTS_EXPORT_PERMISSION]);
  }
}
