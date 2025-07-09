import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceFlows1751827827663 implements MigrationInterface {
  name = 'ResourceFlows1751827827663';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('event.resource.usage.started','event.resource.usage.stopped','event.resource.usage.takeover','action.http.sendRequest','action.mqtt.sendMessage','action.util.wait') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL)`
    );
    await queryRunner.query(
      `CREATE TABLE "resource_flow_edge" ("id" text PRIMARY KEY NOT NULL, "source" text NOT NULL, "target" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL)`
    );
    await queryRunner.query(
      `CREATE TABLE "resource_flow_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "nodeId" text, "flowRunId" text NOT NULL, "type" varchar CHECK( "type" IN ('flow.start','node.processing.started','node.processing.failed','node.processing.completed','flow.completed') ) NOT NULL, "payload" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL)`
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('event.resource.usage.started','event.resource.usage.stopped','event.resource.usage.takeover','action.http.sendRequest','action.mqtt.sendMessage','action.util.wait') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") SELECT "id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY" FROM "resource_flow_node"`
    );
    await queryRunner.query(`DROP TABLE "resource_flow_node"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_node" RENAME TO "resource_flow_node"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_edge" ("id" text PRIMARY KEY NOT NULL, "source" text NOT NULL, "target" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, CONSTRAINT "FK_74a2515d5f46bc0515a19533133" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_edge"("id", "source", "target", "createdAt", "updatedAt", "resourceId") SELECT "id", "source", "target", "createdAt", "updatedAt", "resourceId" FROM "resource_flow_edge"`
    );
    await queryRunner.query(`DROP TABLE "resource_flow_edge"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_edge" RENAME TO "resource_flow_edge"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "nodeId" text, "flowRunId" text NOT NULL, "type" varchar CHECK( "type" IN ('flow.start','node.processing.started','node.processing.failed','node.processing.completed','flow.completed') ) NOT NULL, "payload" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, CONSTRAINT "FK_2405759ff66913fad6e42ef12a3" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_log"("id", "nodeId", "flowRunId", "type", "payload", "createdAt", "resourceId") SELECT "id", "nodeId", "flowRunId", "type", "payload", "createdAt", "resourceId" FROM "resource_flow_log"`
    );
    await queryRunner.query(`DROP TABLE "resource_flow_log"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_log" RENAME TO "resource_flow_log"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_flow_log" RENAME TO "temporary_resource_flow_log"`);
    await queryRunner.query(
      `CREATE TABLE "resource_flow_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "nodeId" text, "flowRunId" text NOT NULL, "type" varchar CHECK( "type" IN ('flow.start','node.processing.started','node.processing.failed','node.processing.completed','flow.completed') ) NOT NULL, "payload" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_flow_log"("id", "nodeId", "flowRunId", "type", "payload", "createdAt", "resourceId") SELECT "id", "nodeId", "flowRunId", "type", "payload", "createdAt", "resourceId" FROM "temporary_resource_flow_log"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_flow_log"`);
    await queryRunner.query(`ALTER TABLE "resource_flow_edge" RENAME TO "temporary_resource_flow_edge"`);
    await queryRunner.query(
      `CREATE TABLE "resource_flow_edge" ("id" text PRIMARY KEY NOT NULL, "source" text NOT NULL, "target" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_flow_edge"("id", "source", "target", "createdAt", "updatedAt", "resourceId") SELECT "id", "source", "target", "createdAt", "updatedAt", "resourceId" FROM "temporary_resource_flow_edge"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_flow_edge"`);
    await queryRunner.query(`ALTER TABLE "resource_flow_node" RENAME TO "temporary_resource_flow_node"`);
    await queryRunner.query(
      `CREATE TABLE "resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('event.resource.usage.started','event.resource.usage.stopped','event.resource.usage.takeover','action.http.sendRequest','action.mqtt.sendMessage','action.util.wait') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") SELECT "id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY" FROM "temporary_resource_flow_node"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_flow_node"`);
    await queryRunner.query(`DROP TABLE "resource_flow_log"`);
    await queryRunner.query(`DROP TABLE "resource_flow_edge"`);
    await queryRunner.query(`DROP TABLE "resource_flow_node"`);
  }
}
