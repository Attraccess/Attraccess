import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { postgresMigrations } from './index';
import { FormImages1796200000002 } from './1796200000002-form-images';

jest.setTimeout(120_000);

describe('FormImages1796200000002 (persistence)', () => {
  let source: DataSource;

  beforeEach(async () => {
    source = await createTestDataSource({ migrations: postgresMigrations, migrationsRun: true });
  });
  afterEach(() => closeTestDataSource(source));

  it('reverts with image fields in place: they go, the other fields of their form stay', async () => {
    await source.query(`INSERT INTO "resource" (id, name, type) VALUES (1, 'Laser', 'machine')`);
    await source.query(`INSERT INTO "form" (id, name, scope, "resourceId") VALUES (1, 'Check-in', 'resource', 1)`);
    await source.query(
      `INSERT INTO "form_field" (id, "formId", name, type) VALUES (1, 1, 'Name', 'text'), (2, 1, 'Photo', 'image')`,
    );

    const runner = source.createQueryRunner();
    try {
      await new FormImages1796200000002().down(runner);
    } finally {
      await runner.release();
    }

    expect(await source.query(`SELECT id, type::text AS type FROM "form_field" ORDER BY id`)).toEqual([
      { id: 1, type: 'text' },
    ]);
    const [{ count }] = await source.query(
      `SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_name IN ('form_image', 'form_image_handoff')`,
    );
    expect(count).toBe(0);
  });
});
