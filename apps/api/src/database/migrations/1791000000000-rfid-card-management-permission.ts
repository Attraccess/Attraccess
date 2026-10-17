import { MigrationInterface, QueryRunner } from 'typeorm';

const PERMISSION = 'users.rfid-cards.manage';

export class RfidCardManagementPermission1791000000000 implements MigrationInterface {
  name = 'RfidCardManagementPermission1791000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT OR IGNORE INTO "permission" ("key", "label", "description", "category") VALUES (?, ?, ?, ?)`,
      [
        PERMISSION,
        'Manage User RFID Cards',
        'Allows viewing, enrolling, activating, deactivating, and deleting RFID cards for any user',
        'users',
      ],
    );
    await queryRunner.query(
      `INSERT OR IGNORE INTO "role_permission" ("roleId", "permissionKey")
       SELECT "id", ? FROM "role" WHERE "key" = 'administrator'`,
      [PERMISSION],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permission" WHERE "permissionKey" = ?`, [PERMISSION]);
    await queryRunner.query(`DELETE FROM "permission" WHERE "key" = ?`, [PERMISSION]);
  }
}
