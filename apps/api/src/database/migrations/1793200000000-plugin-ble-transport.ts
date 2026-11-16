import { MigrationInterface, QueryRunner } from 'typeorm';

/** Plugin BLE transport: per-reader admin opt-in and the endpoints plugins bind to devices near a reader. */
export class PluginBleTransport1793200000000 implements MigrationInterface {
  name = 'PluginBleTransport1793200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('attractap', 'allowPluginBle'))) {
      await queryRunner.query(`ALTER TABLE "attractap" ADD COLUMN "allowPluginBle" boolean NOT NULL DEFAULT (0)`);
    }
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "plugin_ble_endpoint" (
        "id" varchar PRIMARY KEY NOT NULL,
        "pluginId" text NOT NULL,
        "readerId" integer NOT NULL,
        "address" text NOT NULL,
        "addressType" text NOT NULL,
        "profileId" text NOT NULL,
        "label" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_plugin_ble_endpoint_reader" FOREIGN KEY ("readerId") REFERENCES "attractap" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_plugin_ble_endpoint_plugin_reader_address" ON "plugin_ble_endpoint" ("pluginId", "readerId", "address")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_plugin_ble_endpoint_plugin" ON "plugin_ble_endpoint" ("pluginId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_plugin_ble_endpoint_address" ON "plugin_ble_endpoint" ("address")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plugin_ble_endpoint_address"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plugin_ble_endpoint_plugin"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_plugin_ble_endpoint_plugin_reader_address"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plugin_ble_endpoint"`);
    if (await queryRunner.hasColumn('attractap', 'allowPluginBle')) {
      await queryRunner.query(`ALTER TABLE "attractap" DROP COLUMN "allowPluginBle"`);
    }
  }
}
