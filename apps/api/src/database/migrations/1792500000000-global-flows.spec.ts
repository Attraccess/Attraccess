import { DataSource, QueryRunner } from 'typeorm';
import { GlobalFlows1792500000000 } from './1792500000000-global-flows';

// The resource flow tables as they were before global flows.
async function legacySchema(runner: QueryRunner) {
  await runner.query('CREATE TABLE "resource" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar)');
  await runner.query(
    `CREATE TABLE "resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar NOT NULL, "data" json, ` +
      `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
      `"resourceId" integer NOT NULL, "positionX" integer NOT NULL, "positionY" integer NOT NULL, ` +
      `CONSTRAINT "FK_ca3080b2dbc9c7c88a4a64c469d" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
  );
  await runner.query(
    `CREATE TABLE "resource_flow_edge" ("id" text PRIMARY KEY NOT NULL, "source" text NOT NULL, "target" text NOT NULL, ` +
      `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
      `"resourceId" integer NOT NULL, "sourceHandle" text, "targetHandle" text, ` +
      `CONSTRAINT "FK_74a2515d5f46bc0515a19533133" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
  );
}

const nodeRows =
  'SELECT "id", "type", "data", "resourceId", "positionX", "positionY" FROM "resource_flow_node" ORDER BY "id"';
const edgeRows =
  'SELECT "id", "source", "target", "resourceId", "sourceHandle", "targetHandle" FROM "resource_flow_edge" ORDER BY "id"';
const insertNode = (id: string, resourceId: number | null, flowId: number | null) => [
  `INSERT INTO "resource_flow_node" ("id", "type", "data", "resourceId", "flowId", "positionX", "positionY") VALUES (?, 'input.resource.usage.started', '{}', ?, ?, 0, 0)`,
  [id, resourceId, flowId],
];
const insertEdge = (id: string, resourceId: number | null, flowId: number | null) => [
  `INSERT INTO "resource_flow_edge" ("id", "source", "target", "resourceId", "flowId") VALUES (?, 'a', 'b', ?, ?)`,
  [id, resourceId, flowId],
];
const tableNames = async (runner: QueryRunner) =>
  (await runner.query(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((row: { name: string }) => row.name);
const indexNames = async (runner: QueryRunner) =>
  (await runner.query(`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'IDX_resource_flow_%'`))
    .map((row: { name: string }) => row.name)
    .sort();

// Several real SQLite table rebuilds per case; coverage runs on loaded CI machines exceed Jest's 5 s default.
jest.setTimeout(30_000);

describe('global flows migration', () => {
  it('keeps resource flows, enforces exactly one owner, and drops global flows on revert', async () => {
    const source = await new DataSource({ type: 'sqlite', database: ':memory:', entities: [] }).initialize();
    const runner = source.createQueryRunner();
    try {
      await runner.query('PRAGMA foreign_keys = ON');
      await legacySchema(runner);
      await runner.query(`INSERT INTO "resource" ("id", "name") VALUES (1, 'Laser')`);
      await runner.query(
        `INSERT INTO "resource_flow_node" ("id", "type", "data", "resourceId", "positionX", "positionY") ` +
          `VALUES ('start', 'input.resource.usage.started', '{}', 1, 10, 20), ('http', 'output.http.sendRequest', '{"url":"https://example.com"}', 1, 30, 40)`,
      );
      await runner.query(
        `INSERT INTO "resource_flow_edge" ("id", "source", "target", "resourceId", "sourceHandle", "targetHandle") ` +
          `VALUES ('edge', 'start', 'http', 1, 'output', 'input')`,
      );
      const nodesBefore = await runner.query(nodeRows);
      const edgesBefore = await runner.query(edgeRows);

      const migration = new GlobalFlows1792500000000();
      await migration.up(runner);

      expect(await runner.query(nodeRows)).toEqual(nodesBefore);
      expect(await runner.query(edgeRows)).toEqual(edgesBefore);
      expect(await runner.query('SELECT "flowId" FROM "resource_flow_node"')).toEqual([
        { flowId: null },
        { flowId: null },
      ]);
      expect(await indexNames(runner)).toEqual([
        'IDX_resource_flow_edge_flow',
        'IDX_resource_flow_edge_source',
        'IDX_resource_flow_node_flow',
        'IDX_resource_flow_node_type_flow',
      ]);

      await runner.query(`INSERT INTO "flow" ("id", "name") VALUES (5, 'Notify')`);
      expect(await runner.query('SELECT "enabled", "scope" FROM "flow"')).toEqual([{ enabled: 1, scope: 'global' }]);
      // Neither owner and both owners are rejected, for nodes and for edges.
      for (const insert of [insertNode, insertEdge]) {
        for (const [resourceId, flowId] of [
          [null, null],
          [1, 5],
        ]) {
          const [sql, parameters] = insert('bad', resourceId, flowId);
          await expect(runner.query(sql as string, parameters as unknown[])).rejects.toThrow(/CHECK constraint failed/);
        }
      }
      for (const insert of [insertNode, insertEdge]) {
        const [sql, parameters] = insert('global', null, 5);
        await runner.query(sql as string, parameters as unknown[]);
      }
      // Deleting the flow takes its nodes and edges.
      await runner.query(`INSERT INTO "flow" ("id", "name") VALUES (6, 'Other')`);
      const [sql, parameters] = insertNode('other', null, 6);
      await runner.query(sql as string, parameters as unknown[]);
      await runner.query('DELETE FROM "flow" WHERE "id" = 6');
      expect(await runner.query(`SELECT "id" FROM "resource_flow_node" WHERE "id" = 'other'`)).toEqual([]);

      await migration.down(runner);

      expect(await runner.query(nodeRows)).toEqual(nodesBefore);
      expect(await runner.query(edgeRows)).toEqual(edgesBefore);
      expect(await tableNames(runner)).not.toContain('flow');
      expect(await indexNames(runner)).toEqual([]);
      const nodeColumns = await runner.query('PRAGMA table_info("resource_flow_node")');
      expect(nodeColumns.map((column: { name: string }) => column.name)).not.toContain('flowId');
      expect(nodeColumns.find((column: { name: string }) => column.name === 'resourceId')).toMatchObject({
        notnull: 1,
      });
      expect(await runner.query('PRAGMA foreign_key_check')).toEqual([]);
    } finally {
      await runner.release();
      await source.destroy();
    }
  });
});
