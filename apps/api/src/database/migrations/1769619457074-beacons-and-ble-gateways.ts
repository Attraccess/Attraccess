import { MigrationInterface, QueryRunner } from "typeorm";

export class BeaconsAndBleGateways1769619457074 implements MigrationInterface {
  name = 'BeaconsAndBleGateways1769619457074'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "beacon" ("identifier" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('holyiot') ) NOT NULL, "battery" integer, "lastSeenAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE TABLE "beacon_position" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "beaconIdentifier" text NOT NULL, "x" real NOT NULL, "y" real NOT NULL, "residual" real, "observedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE TABLE "ble_gateway" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "identifier" text NOT NULL, "mqttServerId" integer NOT NULL, "topic" text NOT NULL, "subscribeQos" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "x" real, "y" real, "txPowerAt1m" real, "pathLossExponent" real, "calibrationUpdatedAt" datetime, CONSTRAINT "UQ_48d39bf9d37b36e4c6efb1adffa" UNIQUE ("identifier"))`);
    await queryRunner.query(`CREATE INDEX "IDX_cafb41e2758ad8bb483c410663" ON "beacon_position" ("beaconIdentifier", "observedAt") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_cafb41e2758ad8bb483c410663"`);
    await queryRunner.query(`DROP TABLE "ble_gateway"`);
    await queryRunner.query(`DROP TABLE "beacon_position"`);
    await queryRunner.query(`DROP TABLE "beacon"`);
  }

}
