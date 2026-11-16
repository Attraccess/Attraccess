import { MigrationInterface, QueryRunner } from '@attraccess/plugins-backend-sdk';

/**
 * Creates the table for the Matter sidecar connection settings: one row, with the service token stored encrypted.
 * Self-contained (no foreign key to host tables), because plugin up-migrations may run before the host's own.
 */
export class CreateMatterConnection1793900000000 implements MigrationInterface {
  name = 'CreateMatterConnection1793900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "plugin_matter_connection" (
        "id" integer PRIMARY KEY NOT NULL,
        "url" varchar NOT NULL,
        "encrypted_credential" text NOT NULL,
        "ca_certificate" text,
        "credential_updated_at" varchar NOT NULL,
        "updated_at" varchar NOT NULL,
        "updated_by" integer,
        CONSTRAINT "CHK_plugin_matter_connection_singleton" CHECK ("id" = 1)
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "plugin_matter_connection"`);
  }
}
