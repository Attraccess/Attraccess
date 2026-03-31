import { MigrationInterface, QueryRunner } from "typeorm";

export class AttractapLedCapability1774980294900 implements MigrationInterface {
    name = 'AttractapLedCapability1774980294900'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_attractap" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "apiTokenHash" text NOT NULL, "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firmwareName" text, "firmwareVariant" text, "firmwareVersion" text, "firmwareCapabilitiesResourceselection" boolean NOT NULL DEFAULT (1))`);
        await queryRunner.query(`INSERT INTO "temporary_attractap"("id", "name", "apiTokenHash", "lastConnection", "firstConnection", "firmwareName", "firmwareVariant", "firmwareVersion", "firmwareCapabilitiesResourceselection") SELECT "id", "name", "apiTokenHash", "lastConnection", "firstConnection", "firmwareName", "firmwareVariant", "firmwareVersion", "firmwareCapabilitiesResourceselection" FROM "attractap"`);
        await queryRunner.query(`DROP TABLE "attractap"`);
        await queryRunner.query(`ALTER TABLE "temporary_attractap" RENAME TO "attractap"`);
        await queryRunner.query(`CREATE TABLE "temporary_attractap" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "apiTokenHash" text NOT NULL, "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firmwareName" text, "firmwareVariant" text, "firmwareVersion" text, "firmwareCapabilitiesResourceselection" boolean NOT NULL DEFAULT (1), "ledBrightness" integer NOT NULL DEFAULT (255), "firmwareCapabilitiesResourceactionselection" boolean NOT NULL DEFAULT (0), "firmwareCapabilitiesCardenrollment" boolean NOT NULL DEFAULT (1), "firmwareCapabilitiesHasleds" boolean NOT NULL DEFAULT (0))`);
        await queryRunner.query(`INSERT INTO "temporary_attractap"("id", "name", "apiTokenHash", "lastConnection", "firstConnection", "firmwareName", "firmwareVariant", "firmwareVersion", "firmwareCapabilitiesResourceselection") SELECT "id", "name", "apiTokenHash", "lastConnection", "firstConnection", "firmwareName", "firmwareVariant", "firmwareVersion", "firmwareCapabilitiesResourceselection" FROM "attractap"`);
        await queryRunner.query(`DROP TABLE "attractap"`);
        await queryRunner.query(`ALTER TABLE "temporary_attractap" RENAME TO "attractap"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "attractap" RENAME TO "temporary_attractap"`);
        await queryRunner.query(`CREATE TABLE "attractap" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "apiTokenHash" text NOT NULL, "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firmwareName" text, "firmwareVariant" text, "firmwareVersion" text, "firmwareCapabilitiesResourceselection" boolean NOT NULL DEFAULT (1))`);
        await queryRunner.query(`INSERT INTO "attractap"("id", "name", "apiTokenHash", "lastConnection", "firstConnection", "firmwareName", "firmwareVariant", "firmwareVersion", "firmwareCapabilitiesResourceselection") SELECT "id", "name", "apiTokenHash", "lastConnection", "firstConnection", "firmwareName", "firmwareVariant", "firmwareVersion", "firmwareCapabilitiesResourceselection" FROM "temporary_attractap"`);
        await queryRunner.query(`DROP TABLE "temporary_attractap"`);
        await queryRunner.query(`ALTER TABLE "attractap" RENAME TO "temporary_attractap"`);
        await queryRunner.query(`CREATE TABLE "attractap" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "apiTokenHash" text NOT NULL, "lastConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firstConnection" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "firmwareName" text, "firmwareVariant" text, "firmwareVersion" text, "firmwareCapabilitiesResourceselection" boolean NOT NULL DEFAULT (1), "firmwareCapabilitiesResourceActionSelection" boolean NOT NULL DEFAULT (0), "firmwareCapabilitiesCardEnrollment" boolean NOT NULL DEFAULT (1))`);
        await queryRunner.query(`INSERT INTO "attractap"("id", "name", "apiTokenHash", "lastConnection", "firstConnection", "firmwareName", "firmwareVariant", "firmwareVersion", "firmwareCapabilitiesResourceselection") SELECT "id", "name", "apiTokenHash", "lastConnection", "firstConnection", "firmwareName", "firmwareVariant", "firmwareVersion", "firmwareCapabilitiesResourceselection" FROM "temporary_attractap"`);
        await queryRunner.query(`DROP TABLE "temporary_attractap"`);
    }

}
