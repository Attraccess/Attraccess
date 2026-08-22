import { MigrationInterface, QueryRunner } from 'typeorm';

const API_TOKEN_MANAGEMENT_PERMISSION = 'users.api-tokens.manage';

export class ApiTokenManagementPermission1783400000000 implements MigrationInterface {
  name = 'ApiTokenManagementPermission1783400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT OR IGNORE INTO "permission" ("key", "label", "description", "category") VALUES (?, ?, ?, ?)`,
      [
        API_TOKEN_MANAGEMENT_PERMISSION,
        'Manage API Tokens',
        'Allows creating, viewing, updating, and revoking personal API tokens',
        'users',
      ],
    );
    await queryRunner.query(
      `INSERT OR IGNORE INTO "role_permission" ("roleId", "permissionKey")
       SELECT "id", ? FROM "role" WHERE "key" = 'administrator'`,
      [API_TOKEN_MANAGEMENT_PERMISSION],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permission" WHERE "permissionKey" = ?`, [
      API_TOKEN_MANAGEMENT_PERMISSION,
    ]);
    await queryRunner.query(`DELETE FROM "permission" WHERE "key" = ?`, [API_TOKEN_MANAGEMENT_PERMISSION]);
  }
}
