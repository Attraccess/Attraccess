import { MigrationInterface, QueryRunner } from "typeorm";

export class BeaconsAndBleGateways1769608058660 implements MigrationInterface {
  name = 'BeaconsAndBleGateways1769608058660'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "ble_gateway" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "identifier" text NOT NULL, "mqttServerId" integer NOT NULL, "topic" text NOT NULL, "subscribeQos" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_48d39bf9d37b36e4c6efb1adffa" UNIQUE ("identifier"))`);
    await queryRunner.query(`CREATE TABLE "beacon" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "identifier" text NOT NULL, "type" varchar CHECK( "type" IN ('eddystone') ) NOT NULL, "gatewayId" integer NOT NULL, "distanceToGateway" real, "battery" integer, "lastSeenAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_77fdb944fed9ebe42b6d9d8b5b" ON "beacon" ("type", "identifier", "gatewayId") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_77fdb944fed9ebe42b6d9d8b5b"`);
    await queryRunner.query(`DROP TABLE "beacon"`);
    await queryRunner.query(`DROP TABLE "ble_gateway"`);
  }

}
