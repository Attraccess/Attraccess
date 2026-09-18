import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

/**
 * Creates the Shelly device registry table. Run by the host's plugin-migration
 * runner on boot (before any plugin code), and reverted on uninstall so the
 * table is dropped cleanly — see docs/en/plugins/database-migrations.md.
 *
 * The column set mirrors exactly the table the registry service used to create
 * by hand in `onModuleInit`, so existing data shape is preserved. The table is
 * self-contained (no FK to host tables) because plugin up-migrations may run
 * before the host's own migrations on a fresh database.
 */
export class CreateShellyDevices1749470400000 implements MigrationInterface {
  name = 'CreateShellyDevices1749470400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "plugin_shelly_devices" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar NOT NULL,
        "ip_address" varchar NOT NULL,
        "generation" integer,
        "model" varchar,
        "auth_state" varchar NOT NULL DEFAULT ('unknown'),
        "last_probe_at" varchar,
        "last_probe_error" varchar,
        "created_at" varchar NOT NULL,
        "updated_at" varchar NOT NULL,
        CONSTRAINT "UQ_plugin_shelly_devices_ip_address" UNIQUE ("ip_address")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "plugin_shelly_devices"`);
  }
}
