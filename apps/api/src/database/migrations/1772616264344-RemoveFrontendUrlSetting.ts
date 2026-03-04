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
        const backendUrl = await queryRunner.query(`SELECT "value" FROM "setting" WHERE "parent" = ? AND "key" = ?`, ['app', 'backend_url']);
        await queryRunner.query(`INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)`, ['app', 'frontend_url', backendUrl[0].value]);
    }

}
