import { MigrationInterface, QueryRunner } from 'typeorm';

export class FlowsButtonInput1755425568558 implements MigrationInterface {
  name = 'FlowsButtonInput1755425568558';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('input.button','input.resource.usage.started','input.resource.usage.stopped','input.resource.usage.takeover','output.http.sendRequest','output.mqtt.sendMessage','processing.wait','processing.if') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") SELECT "id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY" FROM "resource_flow_node"`
    );
    await queryRunner.query(`DROP TABLE "resource_flow_node"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_node" RENAME TO "resource_flow_node"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_flow_node" RENAME TO "temporary_resource_flow_node"`);
    await queryRunner.query(
      `CREATE TABLE "resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('input.resource.usage.started','input.resource.usage.stopped','input.resource.usage.takeover','output.http.sendRequest','output.mqtt.sendMessage','processing.wait','processing.if') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") SELECT "id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY" FROM "temporary_resource_flow_node"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_flow_node"`);
  }
}
