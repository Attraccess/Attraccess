import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

/**
 * Adds Zigbee support to the device registry (ATT-789).
 *
 * Two transports now exist side by side: `wifi-mqtt` (the device runs its own
 * MQTT client — ATT-499) and `zigbee` (the device is reached through the
 * zigbee2mqtt gateway). Existing rows predate Zigbee, so the column defaults to
 * `wifi-mqtt` and no backfill is needed.
 *
 * A Gen4 in Zigbee mode keeps its WiFi station and HTTP RPC endpoint (see the
 * spike on ATT-789), so `ip_address` stays populated and required for both
 * transports — that is what lets us drive pairing over RPC in the first place.
 *
 * The gateway table holds exactly one row (`id = 1`): a single zigbee2mqtt
 * instance per Attraccess deployment. Modelled as a typed single-row table
 * rather than a key/value store so the columns stay checkable.
 */
export class AddZigbeeSupport1749470500000 implements MigrationInterface {
  name = 'AddZigbeeSupport1749470500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plugin_shelly_devices" ADD COLUMN "transport" varchar NOT NULL DEFAULT ('wifi-mqtt')`
    );
    // Nullable: only set once a device is Zigbee-capable (learned from a probe)
    // and actually paired to the gateway.
    await queryRunner.query(`ALTER TABLE "plugin_shelly_devices" ADD COLUMN "zigbee_capable" integer`);
    await queryRunner.query(`ALTER TABLE "plugin_shelly_devices" ADD COLUMN "zigbee_ieee_address" varchar`);
    await queryRunner.query(`ALTER TABLE "plugin_shelly_devices" ADD COLUMN "zigbee_friendly_name" varchar`);

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "plugin_shelly_zigbee_gateway" (
        "id" integer PRIMARY KEY NOT NULL,
        "mqtt_server_id" integer NOT NULL,
        "base_topic" varchar NOT NULL DEFAULT ('zigbee2mqtt'),
        "updated_at" varchar NOT NULL
      )`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "plugin_shelly_zigbee_gateway"`);
    // SQLite has supported DROP COLUMN since 3.35; the host ships a newer build.
    await queryRunner.query(`ALTER TABLE "plugin_shelly_devices" DROP COLUMN "zigbee_friendly_name"`);
    await queryRunner.query(`ALTER TABLE "plugin_shelly_devices" DROP COLUMN "zigbee_ieee_address"`);
    await queryRunner.query(`ALTER TABLE "plugin_shelly_devices" DROP COLUMN "zigbee_capable"`);
    await queryRunner.query(`ALTER TABLE "plugin_shelly_devices" DROP COLUMN "transport"`);
  }
}
