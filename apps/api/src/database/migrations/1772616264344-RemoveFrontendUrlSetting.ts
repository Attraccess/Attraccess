import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveFrontendUrlSetting1772616264344 implements MigrationInterface {
    name = 'RemoveFrontendUrlSetting1772616264344'

    public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "setting" WHERE "parent" = ? AND "key" = ?`,
      ['app', 'frontend_url'],
    );    
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const rows = await queryRunner.query(`SELECT "value" FROM "setting" WHERE "parent" = ? AND "key" = ?`, ['app', 'backend_url']);
        const value = rows[0]?.value ?? '';
        await queryRunner.query(`INSERT OR IGNORE INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)`, ['app', 'frontend_url', value]);
    }

}
