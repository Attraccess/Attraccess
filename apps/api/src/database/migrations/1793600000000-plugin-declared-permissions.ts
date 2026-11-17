import { MigrationInterface, QueryRunner } from 'typeorm';

const COLUMNS: Array<[string, string]> = [
  ['pluginName', 'text'],
  ['labelDe', 'text'],
  ['descriptionDe', 'text'],
  ['categoryLabel', 'text'],
  ['categoryLabelDe', 'text'],
  ['available', 'boolean NOT NULL DEFAULT (1)'],
];

/**
 * Plugin-declared permissions (ATT-1003): the host registers plugin keys at boot, so a permission row records the
 * plugin that owns it, its German texts and whether the plugin is currently loaded. Core rows keep a null owner and
 * stay available.
 */
export class PluginDeclaredPermissions1793600000000 implements MigrationInterface {
  name = 'PluginDeclaredPermissions1793600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [column, type] of COLUMNS) {
      if (!(await queryRunner.hasColumn('permission', column))) {
        await queryRunner.query(`ALTER TABLE "permission" ADD COLUMN "${column}" ${type}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('permission', 'pluginName')) {
      // An older host does not know plugin keys; left in place they would break its administrator-equivalence count.
      // A later upgrade registers them as new keys: default roles get them again, custom role and token grants not.
      const owned = `SELECT "key" FROM "permission" WHERE "pluginName" IS NOT NULL`;
      await queryRunner.query(`DELETE FROM "role_permission" WHERE "permissionKey" IN (${owned})`);
      await queryRunner.query(`DELETE FROM "api_token_permission" WHERE "permissionKey" IN (${owned})`);
      await queryRunner.query(`DELETE FROM "permission" WHERE "pluginName" IS NOT NULL`);
    }
    for (const [column] of [...COLUMNS].reverse()) {
      if (await queryRunner.hasColumn('permission', column)) {
        await queryRunner.query(`ALTER TABLE "permission" DROP COLUMN "${column}"`);
      }
    }
  }
}
