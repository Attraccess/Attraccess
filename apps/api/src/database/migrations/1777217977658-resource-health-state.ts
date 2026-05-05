import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceHealthState1777217977658 implements MigrationInterface {
  name = 'ResourceHealthState1777217977658';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "resource_health_state" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "identifier" text NOT NULL DEFAULT (''), "status" varchar NOT NULL DEFAULT ('healthy'), "reason" text, "source" varchar NOT NULL DEFAULT ('manual'), "lastReportedAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_resource_health_resource_identifier" UNIQUE ("resourceId", "identifier"), CONSTRAINT "FK_resource_health_state_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_health_resource" ON "resource_health_state" ("resourceId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") SELECT "id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY" FROM "resource_flow_node"`,
    );
    await queryRunner.query(`DROP TABLE "resource_flow_node"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_node" RENAME TO "resource_flow_node"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "resource_flow_node" WHERE "type" IN ('output.resource.health.heartbeat','output.resource.health.set')`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_health_resource"`);
    await queryRunner.query(`DROP TABLE "resource_health_state"`);
  }
}
