import { MigrationInterface, QueryRunner } from 'typeorm';

const OWNER_CHECK = `CHECK (("resourceId" IS NULL) <> ("flowId" IS NULL))`;

export class GlobalFlows1792500000000 implements MigrationInterface {
  name = 'GlobalFlows1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "flow" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "description" text, ` +
        `"enabled" boolean NOT NULL DEFAULT (1), "scope" varchar NOT NULL DEFAULT ('global'), ` +
        `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );

    // SQLite cannot relax NOT NULL in place, so both tables are rebuilt with a nullable resourceId, the new flowId and an
    // "exactly one owner" check.
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar NOT NULL, "data" json, ` +
        `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"resourceId" integer, "positionX" integer NOT NULL, "positionY" integer NOT NULL, "flowId" integer, ` +
        `CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, ` +
        `CONSTRAINT "FK_resource_flow_node_flow" FOREIGN KEY ("flowId") REFERENCES "flow" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, ` +
        `CONSTRAINT "CHK_resource_flow_node_owner" ${OWNER_CHECK})`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") ` +
        `SELECT "id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY" FROM "resource_flow_node"`,
    );
    await queryRunner.query(`DROP TABLE "resource_flow_node"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_node" RENAME TO "resource_flow_node"`);

    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_edge" ("id" text PRIMARY KEY NOT NULL, "source" text NOT NULL, "target" text NOT NULL, ` +
        `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"resourceId" integer, "sourceHandle" text, "targetHandle" text, "flowId" integer, ` +
        `CONSTRAINT "FK_74a2515d5f46bc0515a19533133" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, ` +
        `CONSTRAINT "FK_resource_flow_edge_flow" FOREIGN KEY ("flowId") REFERENCES "flow" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, ` +
        `CONSTRAINT "CHK_resource_flow_edge_owner" ${OWNER_CHECK})`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_edge"("id", "source", "target", "createdAt", "updatedAt", "resourceId", "sourceHandle", "targetHandle") ` +
        `SELECT "id", "source", "target", "createdAt", "updatedAt", "resourceId", "sourceHandle", "targetHandle" FROM "resource_flow_edge"`,
    );
    await queryRunner.query(`DROP TABLE "resource_flow_edge"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_edge" RENAME TO "resource_flow_edge"`);

    // One query per lifecycle event: trigger type plus owning flow.
    await queryRunner.query(
      `CREATE INDEX "IDX_resource_flow_node_type_flow" ON "resource_flow_node" ("type", "flowId")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_resource_flow_node_flow" ON "resource_flow_node" ("flowId")`);
    await queryRunner.query(`CREATE INDEX "IDX_resource_flow_edge_flow" ON "resource_flow_edge" ("flowId")`);
    // Every node step looks up the edges leaving it.
    await queryRunner.query(`CREATE INDEX "IDX_resource_flow_edge_source" ON "resource_flow_edge" ("source")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_flow_edge_source"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_flow_edge_flow"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_flow_node_flow"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_flow_node_type_flow"`);

    // Global-flow rows have no resource and cannot exist in the old schema.
    await queryRunner.query(`DELETE FROM "resource_flow_edge" WHERE "resourceId" IS NULL`);
    await queryRunner.query(`DELETE FROM "resource_flow_node" WHERE "resourceId" IS NULL`);

    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_edge" ("id" text PRIMARY KEY NOT NULL, "source" text NOT NULL, "target" text NOT NULL, ` +
        `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"resourceId" integer NOT NULL, "sourceHandle" text, "targetHandle" text, ` +
        `CONSTRAINT "FK_74a2515d5f46bc0515a19533133" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_edge"("id", "source", "target", "createdAt", "updatedAt", "resourceId", "sourceHandle", "targetHandle") ` +
        `SELECT "id", "source", "target", "createdAt", "updatedAt", "resourceId", "sourceHandle", "targetHandle" FROM "resource_flow_edge"`,
    );
    await queryRunner.query(`DROP TABLE "resource_flow_edge"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_edge" RENAME TO "resource_flow_edge"`);

    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar NOT NULL, "data" json, ` +
        `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, ` +
        `CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") ` +
        `SELECT "id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY" FROM "resource_flow_node"`,
    );
    await queryRunner.query(`DROP TABLE "resource_flow_node"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_node" RENAME TO "resource_flow_node"`);

    await queryRunner.query(`DROP TABLE "flow"`);
  }
}
