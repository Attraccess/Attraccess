import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanionDevice1782200000000 implements MigrationInterface {
  name = 'CompanionDevice1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "companion_device" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" text NOT NULL DEFAULT 'Unnamed Device',
        "tokenHash" text NOT NULL,
        "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP)
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "companion_device_resources_resource" (
        "companionDeviceId" integer NOT NULL,
        "resourceId" integer NOT NULL,
        PRIMARY KEY ("companionDeviceId", "resourceId"),
        CONSTRAINT "FK_companion_device_resources_device" FOREIGN KEY ("companionDeviceId") REFERENCES "companion_device" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_companion_device_resources_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_companion_device_resources_device" ON "companion_device_resources_resource" ("companionDeviceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_companion_device_resources_resource" ON "companion_device_resources_resource" ("resourceId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_companion_device_resources_resource"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_companion_device_resources_device"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "companion_device_resources_resource"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "companion_device"`);
  }
}
