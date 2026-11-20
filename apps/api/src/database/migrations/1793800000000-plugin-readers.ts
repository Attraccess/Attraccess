import { MigrationInterface, QueryRunner } from 'typeorm';

/** Plugin readers (ATT-1307): card readers a plugin owns, each assigned at most one resource. */
export class PluginReaders1793800000000 implements MigrationInterface {
  name = 'PluginReaders1793800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "plugin_reader" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "pluginId" text NOT NULL,
        "deviceId" text NOT NULL,
        "name" text NOT NULL,
        "capabilities" text NOT NULL,
        "resourceId" integer,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_plugin_reader_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_plugin_reader_plugin_device" ON "plugin_reader" ("pluginId", "deviceId")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_plugin_reader_plugin" ON "plugin_reader" ("pluginId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plugin_reader_plugin"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_plugin_reader_plugin_device"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plugin_reader"`);
  }
}
