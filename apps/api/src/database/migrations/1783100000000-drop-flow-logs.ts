import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Flow logs are no longer persisted — they are recorded in memory only while a
 * user explicitly records a flow. A single chatty MQTT device wrote ~2M rows a
 * day through SQLite's single connection, stalling the whole API.
 */
export class DropFlowLogs1783100000000 implements MigrationInterface {
  name = 'DropFlowLogs1783100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_flow_log_resource_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "resource_flow_log"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "resource_flow_log" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "nodeId" text, "flowRunId" text NOT NULL, "type" varchar CHECK( "type" IN ('flow.start','node.processing.started','node.processing.failed','node.processing.completed','flow.completed') ) NOT NULL, "payload" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, CONSTRAINT "FK_2405759ff66913fad6e42ef12a3" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_resource_flow_log_resource_created" ON "resource_flow_log" ("resourceId", "createdAt")`,
    );
  }
}
