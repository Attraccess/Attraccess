import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubFlows1770160018000 implements MigrationInterface {
  name = 'SubFlows1770160018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "resource_sub_flow" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" text NOT NULL, "description" text)`,
    );
    await queryRunner.query(
      `CREATE TABLE "resource_sub_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('input.button','input.resource.usage.started','input.resource.usage.stopped','input.resource.usage.takeover','input.resource.door.unlocked','input.resource.door.locked','input.resource.door.unlatched','input.mqtt.message.received','input.resource.activity.no-activity','input.subflow','output.http.sendRequest','output.mqtt.sendMessage','output.resource.billing.calculation.set-additional-items','output.resource.usage.end-session','output.resource.activity.track-activity','output.subflow','processing.wait','processing.if','processing.set-payload','processing.mqtt.waitForMessage','processing.error','processing.subflow') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "subFlowId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_resource_sub_flow_node_subflow" FOREIGN KEY ("subFlowId") REFERENCES "resource_sub_flow" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE TABLE "resource_sub_flow_edge" ("id" text PRIMARY KEY NOT NULL, "source" text NOT NULL, "sourceHandle" text, "target" text NOT NULL, "targetHandle" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "subFlowId" integer NOT NULL, CONSTRAINT "FK_resource_sub_flow_edge_subflow" FOREIGN KEY ("subFlowId") REFERENCES "resource_sub_flow" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('input.button','input.resource.usage.started','input.resource.usage.stopped','input.resource.usage.takeover','input.resource.door.unlocked','input.resource.door.locked','input.resource.door.unlatched','input.mqtt.message.received','input.resource.activity.no-activity','input.subflow','output.http.sendRequest','output.mqtt.sendMessage','output.resource.billing.calculation.set-additional-items','output.resource.usage.end-session','output.resource.activity.track-activity','output.subflow','processing.wait','processing.if','processing.set-payload','processing.mqtt.waitForMessage','processing.error','processing.subflow') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") SELECT "id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY" FROM "resource_flow_node"`,
    );
    await queryRunner.query(`DROP TABLE "resource_flow_node"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_node" RENAME TO "resource_flow_node"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_flow_node" RENAME TO "temporary_resource_flow_node"`);
    await queryRunner.query(
      `CREATE TABLE "resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('input.button','input.resource.usage.started','input.resource.usage.stopped','input.resource.usage.takeover','input.resource.door.unlocked','input.resource.door.locked','input.resource.door.unlatched','input.mqtt.message.received','input.resource.activity.no-activity','output.http.sendRequest','output.mqtt.sendMessage','output.resource.billing.calculation.set-additional-items','output.resource.usage.end-session','output.resource.activity.track-activity','processing.wait','processing.if','processing.set-payload','processing.mqtt.waitForMessage','processing.error') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") SELECT "id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY" FROM "temporary_resource_flow_node"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_flow_node"`);
    await queryRunner.query(`DROP TABLE "resource_sub_flow_edge"`);
    await queryRunner.query(`DROP TABLE "resource_sub_flow_node"`);
    await queryRunner.query(`DROP TABLE "resource_sub_flow"`);
  }
}
