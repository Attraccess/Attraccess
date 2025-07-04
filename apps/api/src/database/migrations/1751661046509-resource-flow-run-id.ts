import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceFlowRunId1751661046509 implements MigrationInterface {
  name = 'ResourceFlowRunId1751661046509';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "nodeId" text NOT NULL, "type" varchar CHECK( "type" IN ('flow.start','node.processing.started','node.processing.failed','node.processing.completed','flow.completed') ) NOT NULL, "payload" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "flowRunId" text NOT NULL, CONSTRAINT "FK_2405759ff66913fad6e42ef12a3" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_log"("id", "nodeId", "type", "payload", "createdAt", "resourceId") SELECT "id", "nodeId", "type", "payload", "createdAt", "resourceId" FROM "resource_flow_log"`
    );
    await queryRunner.query(`DROP TABLE "resource_flow_log"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_log" RENAME TO "resource_flow_log"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_flow_log" RENAME TO "temporary_resource_flow_log"`);
    await queryRunner.query(
      `CREATE TABLE "resource_flow_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "nodeId" text NOT NULL, "type" varchar CHECK( "type" IN ('flow.start','node.processing.started','node.processing.failed','node.processing.completed','flow.completed') ) NOT NULL, "payload" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, CONSTRAINT "FK_2405759ff66913fad6e42ef12a3" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_flow_log"("id", "nodeId", "type", "payload", "createdAt", "resourceId") SELECT "id", "nodeId", "type", "payload", "createdAt", "resourceId" FROM "temporary_resource_flow_log"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_flow_log"`);
  }
}
