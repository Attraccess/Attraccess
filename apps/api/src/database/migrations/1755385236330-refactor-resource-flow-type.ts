import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorResourceFlowType1755385236330 implements MigrationInterface {
  name = 'RefactorResourceFlowType1755385236330';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_edge" ("id" text PRIMARY KEY NOT NULL, "source" text NOT NULL, "target" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "sourceHandle" text, "targetHandle" text, CONSTRAINT "FK_74a2515d5f46bc0515a19533133" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_flow_edge"("id", "source", "target", "createdAt", "updatedAt", "resourceId") SELECT "id", "source", "target", "createdAt", "updatedAt", "resourceId" FROM "resource_flow_edge"`
    );
    await queryRunner.query(`DROP TABLE "resource_flow_edge"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_edge" RENAME TO "resource_flow_edge"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('input.resource.usage.started','input.resource.usage.stopped','input.resource.usage.takeover','output.http.sendRequest','output.mqtt.sendMessage','processing.wait','processing.if') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );

    const nodes = await queryRunner.query(`SELECT * FROM "resource_flow_node"`);
    if (nodes.length > 0) {
      nodes.forEach((node: { id: string; type: string }) => {
        node.type = node.type.replace('event.', 'input.');
        if (node.type === 'action.util.wait') {
          node.type = 'processing.wait';
        }
        node.type = node.type.replace('action.', 'output.');
      });
      await queryRunner.query(
        `INSERT INTO "temporary_resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") VALUES ${nodes
          .map(
            (node) =>
              `('${node.id}', '${node.type}', '${node.data}', '${node.createdAt}', '${node.updatedAt}', '${node.resourceId}', '${node.positionX}', '${node.positionY}')`
          )
          .join(',')}`
      );
    }

    await queryRunner.query(`DROP TABLE "resource_flow_node"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_flow_node" RENAME TO "resource_flow_node"`);

    // reverse node edge direction
    await queryRunner.query(`UPDATE "resource_flow_edge" SET "source" = "target", "target" = "source"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // reverse node edge direction
    await queryRunner.query(`UPDATE "resource_flow_edge" SET "source" = "target", "target" = "source"`);

    await queryRunner.query(`ALTER TABLE "resource_flow_node" RENAME TO "temporary_resource_flow_node"`);
    await queryRunner.query(
      `CREATE TABLE "resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar CHECK( "type" IN ('event.resource.usage.started','event.resource.usage.stopped','event.resource.usage.takeover','action.http.sendRequest','action.mqtt.sendMessage','action.util.wait') ) NOT NULL, "data" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );

    let nodes = await queryRunner.query(`SELECT * FROM "temporary_resource_flow_node"`);
    if (nodes.length > 0) {
      nodes.forEach((node: { id: string; type: string }) => {
        node.type = node.type.replace('input.', 'event.');
        if (node.type === 'processing.wait') {
          node.type = 'action.util.wait';
        }
        node.type = node.type.replace('output.', 'action.');
      });
      nodes = nodes.filter((node) => node.type !== 'processing.if');

      await queryRunner.query(
        `INSERT INTO "resource_flow_node"("id", "type", "data", "createdAt", "updatedAt", "resourceId", "positionX", "positionY") VALUES ${nodes
          .map(
            (node) =>
              `('${node.id}', '${node.type}', '${node.data}', '${node.createdAt}', '${node.updatedAt}', '${node.resourceId}', '${node.positionX}', '${node.positionY}')`
          )
          .join(',')}`
      );
    }

    await queryRunner.query(`DROP TABLE "temporary_resource_flow_node"`);
    await queryRunner.query(`ALTER TABLE "resource_flow_edge" RENAME TO "temporary_resource_flow_edge"`);
    await queryRunner.query(
      `CREATE TABLE "resource_flow_edge" ("id" text PRIMARY KEY NOT NULL, "source" text NOT NULL, "target" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "resourceId" integer NOT NULL, CONSTRAINT "FK_74a2515d5f46bc0515a19533133" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "resource_flow_edge"("id", "source", "target", "createdAt", "updatedAt", "resourceId") SELECT "id", "source", "target", "createdAt", "updatedAt", "resourceId" FROM "temporary_resource_flow_edge"`
    );
    await queryRunner.query(`DROP TABLE "temporary_resource_flow_edge"`);
  }
}
