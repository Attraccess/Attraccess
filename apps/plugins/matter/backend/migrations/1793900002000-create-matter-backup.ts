import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

/**
 * ATT-998: fabric persistence and encrypted backups. Extends `plugin_matter_fabrics` with the identity the plugin
 * recorded (generation, storage instance, root certificate fingerprint), and adds the recovery keys (stored only
 * encrypted) and the backups. Additive: existing rows and tables are left alone.
 *
 * Self-contained, like the other plugin migrations: no foreign keys.
 */
export class CreateMatterBackup1793900002000 implements MigrationInterface {
  name = 'CreateMatterBackup1793900002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "plugin_matter_fabrics" ADD COLUMN "fabric_generation" integer`);
    await queryRunner.query(`ALTER TABLE "plugin_matter_fabrics" ADD COLUMN "storage_instance_id" varchar`);
    await queryRunner.query(`ALTER TABLE "plugin_matter_fabrics" ADD COLUMN "root_cert_fingerprint" varchar`);
    await queryRunner.query(`ALTER TABLE "plugin_matter_fabrics" ADD COLUMN "recorded_at" varchar`);

    await queryRunner.query(
      `CREATE TABLE "plugin_matter_recovery_keys" (
        "id" varchar PRIMARY KEY NOT NULL,
        "key_id" varchar NOT NULL,
        "encrypted_key" text NOT NULL,
        "created_at" varchar NOT NULL,
        "acknowledged_at" varchar,
        "retired_at" varchar
      )`,
    );
    // At most one current key. A rotated key is retired but kept (still encrypted), so older backups stay readable.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_plugin_matter_recovery_keys_current" ON "plugin_matter_recovery_keys" ((1)) WHERE "retired_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_plugin_matter_recovery_keys_key_id" ON "plugin_matter_recovery_keys" ("key_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "plugin_matter_backups" (
        "id" varchar PRIMARY KEY NOT NULL,
        "created_at" varchar NOT NULL,
        "trigger" varchar NOT NULL,
        "actor" integer,
        "outcome" varchar NOT NULL,
        "reason" varchar,
        "size_bytes" integer,
        "sha256" varchar,
        "format_version" integer,
        "plugin_version" varchar,
        "sidecar_version" varchar,
        "matter_js_version" varchar,
        "storage_schema_version" integer,
        "plugin_migration" varchar,
        "fabric_id" varchar,
        "root_cert_fingerprint" varchar,
        "fabric_generation" integer,
        "storage_instance_id" varchar,
        "recovery_key_id" varchar,
        "consistent" boolean,
        "blob" blob,
        CONSTRAINT "CHK_plugin_matter_backups_outcome" CHECK ("outcome" IN ('succeeded', 'failed')),
        CONSTRAINT "CHK_plugin_matter_backups_trigger" CHECK ("trigger" IN ('manual', 'fabric_created', 'restore', 'daily', 'fabric_changed', 'pre_restore'))
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_plugin_matter_backups_created_at" ON "plugin_matter_backups" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "plugin_matter_backups"`);
    await queryRunner.query(`DROP TABLE "plugin_matter_recovery_keys"`);
    await queryRunner.query(`ALTER TABLE "plugin_matter_fabrics" DROP COLUMN "recorded_at"`);
    await queryRunner.query(`ALTER TABLE "plugin_matter_fabrics" DROP COLUMN "root_cert_fingerprint"`);
    await queryRunner.query(`ALTER TABLE "plugin_matter_fabrics" DROP COLUMN "storage_instance_id"`);
    await queryRunner.query(`ALTER TABLE "plugin_matter_fabrics" DROP COLUMN "fabric_generation"`);
  }
}
