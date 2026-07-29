import { DataSource, QueryRunner } from 'typeorm';
import { FixIfNodeOperandOrder1782901000000 } from './1782901000000-fix-if-node-operand-order';

describe('FixIfNodeOperandOrder1782901000000', () => {
  const migration = new FixIfNodeOperandOrder1782901000000();

  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeEach(async () => {
    dataSource = new DataSource({ type: 'sqlite', database: ':memory:', synchronize: false, entities: [] });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();

    // Mirrors the shape created by 1751827827663-resource-flows, so the migration's SQL is exercised for real.
    await queryRunner.query(
      `CREATE TABLE "resource_flow_node" ("id" text PRIMARY KEY NOT NULL, "type" varchar NOT NULL, "data" json, "resourceId" integer NOT NULL)`
    );
  });

  afterEach(async () => {
    await queryRunner.release();
    await dataSource.destroy();
  });

  async function insertNode(id: string, data: unknown, type = 'processing.if') {
    await queryRunner.query(`INSERT INTO "resource_flow_node" ("id", "type", "data", "resourceId") VALUES (?, ?, ?, 1)`, [
      id,
      type,
      JSON.stringify(data),
    ]);
  }

  async function readNode(id: string) {
    const [row] = await queryRunner.query(`SELECT "data" FROM "resource_flow_node" WHERE "id" = ?`, [id]);
    return JSON.parse(row.data);
  }

  it.each([
    ['>', '<'],
    ['<', '>'],
    ['>=', '<='],
    ['<=', '>='],
  ])('inverts %s to %s so existing flows keep their behaviour', async (from, to) => {
    await insertNode('n1', { path: 'payload.temperature', comparisonOperator: from, comparisonValue: '50' });

    await migration.up(queryRunner);

    expect(await readNode('n1')).toEqual({
      path: 'payload.temperature',
      comparisonOperator: to,
      comparisonValue: '50',
    });
  });

  it.each(['=', '!='])('leaves the symmetric operator %s untouched', async (operator) => {
    await insertNode('n1', { path: 'a', comparisonOperator: operator, comparisonValue: 'x' });

    await migration.up(queryRunner);

    expect(await readNode('n1')).toEqual({ path: 'a', comparisonOperator: operator, comparisonValue: 'x' });
  });

  it('preserves comparisonValueIsPath and any other node data', async () => {
    await insertNode('n1', { path: 'a', comparisonOperator: '>', comparisonValue: 'b', comparisonValueIsPath: true });

    await migration.up(queryRunner);

    expect(await readNode('n1')).toEqual({
      path: 'a',
      comparisonOperator: '<',
      comparisonValue: 'b',
      comparisonValueIsPath: true,
    });
  });

  it('ignores nodes of other types that happen to carry a comparisonOperator', async () => {
    await insertNode('n1', { comparisonOperator: '>' }, 'action.http.sendRequest');

    await migration.up(queryRunner);

    expect(await readNode('n1')).toEqual({ comparisonOperator: '>' });
  });

  it('is its own inverse, so down() restores the original operator', async () => {
    await insertNode('n1', { path: 'a', comparisonOperator: '>', comparisonValue: '50' });

    await migration.up(queryRunner);
    expect((await readNode('n1')).comparisonOperator).toBe('<');

    await migration.down(queryRunner);
    expect((await readNode('n1')).comparisonOperator).toBe('>');
  });

  it('is a no-op when there are no if nodes at all', async () => {
    await expect(migration.up(queryRunner)).resolves.toBeUndefined();
  });

  it('skips rows whose data is null', async () => {
    await queryRunner.query(
      `INSERT INTO "resource_flow_node" ("id", "type", "data", "resourceId") VALUES ('n1', 'processing.if', NULL, 1)`
    );

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();
  });
});
