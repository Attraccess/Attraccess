import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { PostgresBaseline1760000000000 } from './1760000000000-baseline';
import { PostgresGlobalForms1795700000000 } from './1795700000000-global-forms';

const formRows = `SELECT "id", "name", "resourceId", "isRequiredOnResourceUsageStart", "isRequiredOnResourceUsageTakeOver", "isRequiredOnResourceUsageEnd", "createdAt" FROM "form" ORDER BY "id"`;
const fieldRows = 'SELECT * FROM "form_field" ORDER BY "id"';
const submissionRows = 'SELECT * FROM "form_submission" ORDER BY "id"';

describe('PostgreSQL global forms migration', () => {
  let source: DataSource;
  const migration = new PostgresGlobalForms1795700000000();
  const run = async (direction: 'up' | 'down') => {
    const runner = source.createQueryRunner();
    try {
      await runner.startTransaction();
      await migration[direction](runner);
      await runner.commitTransaction();
    } finally {
      await runner.release();
    }
  };
  const indexes = async () =>
    (
      await source.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname LIKE 'IDX_form%' ORDER BY indexname`,
      )
    ).map((row: { indexname: string }) => row.indexname);

  // The database at the baseline, with forms as they were before ATT-796.
  beforeEach(async () => {
    source = await createTestDataSource({ empty: true, migrations: [PostgresBaseline1760000000000] });
    await source.runMigrations();
    await source.query(`INSERT INTO "user" ("id", "username", "email") VALUES (4, 'ada', 'ada@example.com')`);
    await source.query(
      `INSERT INTO "resource" ("id", "name", "type") VALUES (1, 'Laser', 'machine'), (2, 'Mill', 'machine')`,
    );
    await source.query(`INSERT INTO "resource_group" ("id", "name") VALUES (3, 'Lasers')`);
    await source.query(
      `INSERT INTO "resource_usage" ("id", "usageAction", "resourceId", "userId", "startTime", "endTime") VALUES (5, 'usage', 1, 4, '2030-01-01T10:00:00Z', '2030-01-01T11:00:00Z')`,
    );
    await source.query(
      `INSERT INTO "form" ("id", "name", "resourceId", "isRequiredOnResourceUsageStart", "isRequiredOnResourceUsageEnd", "createdAt") ` +
        `VALUES (7, 'Safety', 1, true, false, '2030-01-01T00:00:00Z'), (9, 'Feedback', 2, false, true, '2030-01-02T00:00:00Z')`,
    );
    await source.query(`SELECT setval(pg_get_serial_sequence('form', 'id'), 9)`);
    await source.query(
      `INSERT INTO "form_field" ("id", "formId", "name", "type", "isRequired", "position") VALUES (11, 7, 'Goggles?', 'boolean', true, 0), (12, 9, 'Notes', 'text', false, 0)`,
    );
    await source.query(
      `INSERT INTO "form_submission" ("id", "formId", "data", "userId", "resourceUsageId", "action") VALUES (21, 7, '{"11":{"value":"true"}}', 4, 5, 'start')`,
    );
  }, 120_000);

  afterEach(async () => {
    await closeTestDataSource(source);
  });

  it('turns every form into a resource form with the same id, flags, fields and submissions', async () => {
    const forms = await source.query(formRows);
    const fields = await source.query(fieldRows);
    const submissions = await source.query(submissionRows);

    await run('up');

    expect(await source.query(formRows)).toEqual(forms);
    expect(await source.query(fieldRows)).toEqual(fields);
    expect(await source.query(submissionRows)).toEqual(submissions);
    expect(await source.query('SELECT "scope", "groupId", "deletedAt" FROM "form" ORDER BY "id"')).toEqual([
      { scope: 'resource', groupId: null, deletedAt: null },
      { scope: 'resource', groupId: null, deletedAt: null },
    ]);
    expect(await indexes()).toEqual([
      'IDX_form_field_form',
      'IDX_form_resource',
      'IDX_form_resource_override_form_resource',
      'IDX_form_resource_override_resource',
      'IDX_form_scope_group',
      'IDX_form_submission_form_created',
      'IDX_form_submission_resource_usage',
    ]);
    const [created] = await source.query(
      `INSERT INTO "form" ("name", "scope") VALUES ('Everywhere', 'global') RETURNING "id"`,
    );
    expect(created.id).toBe(10);
  });

  it('enforces the scope owners, unique overrides and a SET NULL group link for deleted group forms', async () => {
    await run('up');
    const insert = (
      scope: string,
      resourceId: number | null,
      groupId: number | null,
      deletedAt: string | null = null,
    ) =>
      source.query(
        `INSERT INTO "form" ("name", "scope", "resourceId", "groupId", "deletedAt") VALUES ('x', $1, $2, $3, $4)`,
        [scope, resourceId, groupId, deletedAt],
      );

    for (const [scope, resourceId, groupId] of [
      ['resource', null, null],
      ['resource', 1, 3],
      ['group', null, null],
      ['group', 1, 3],
      ['global', null, 3],
      ['nowhere', null, null],
    ] as const) {
      await expect(insert(scope, resourceId, groupId)).rejects.toThrow(/CHK_form_scope/);
    }
    await insert('group', null, 3);
    await insert('group', null, 3, '2030-01-01T00:00:00Z');

    await source.query(`INSERT INTO "form_resource_override" ("formId", "resourceId", "disabled") VALUES (7, 1, true)`);
    await expect(
      source.query(`INSERT INTO "form_resource_override" ("formId", "resourceId") VALUES (7, 1)`),
    ).rejects.toThrow(/IDX_form_resource_override_form_resource/);
    expect(
      await source.query(
        `SELECT "disabled", "isRequiredOnResourceUsageStart", "isRequiredOnResourceUsageTakeOver", "isRequiredOnResourceUsageEnd" FROM "form_resource_override"`,
      ),
    ).toEqual([
      {
        disabled: true,
        isRequiredOnResourceUsageStart: null,
        isRequiredOnResourceUsageTakeOver: null,
        isRequiredOnResourceUsageEnd: null,
      },
    ]);

    // Deleting the group is refused while a live form needs it; a deleted one only loses the link.
    await expect(source.query(`DELETE FROM "resource_group" WHERE "id" = 3`)).rejects.toThrow(/CHK_form_scope/);
    await source.query(`UPDATE "form" SET "deletedAt" = '2030-01-01T00:00:00Z' WHERE "scope" = 'group'`);
    await source.query(`DELETE FROM "resource_group" WHERE "id" = 3`);
    expect(await source.query(`SELECT "groupId" FROM "form" WHERE "scope" = 'group'`)).toEqual([
      { groupId: null },
      { groupId: null },
    ]);

    // An override goes with its form and with its resource.
    await source.query(`DELETE FROM "form_submission"`);
    await source.query(`DELETE FROM "form_field" WHERE "formId" = 7`);
    await source.query(`DELETE FROM "form" WHERE "id" = 7`);
    expect(await source.query(`SELECT * FROM "form_resource_override"`)).toEqual([]);
  });

  it('reverts to resource forms only, dropping group, global and deleted forms with their history', async () => {
    await run('up');
    await source.query(`INSERT INTO "form" ("id", "name", "scope") VALUES (30, 'Everywhere', 'global')`);
    await source.query(`INSERT INTO "form" ("id", "name", "scope", "groupId") VALUES (31, 'Lasers', 'group', 3)`);
    await source.query(`UPDATE "form" SET "deletedAt" = '2030-01-01T00:00:00Z' WHERE "id" = 9`);
    await source.query(
      `INSERT INTO "form_field" ("id", "formId", "name", "type") VALUES (13, 30, 'Q', 'text'), (14, 31, 'Q', 'text')`,
    );
    await source.query(
      `INSERT INTO "form_submission" ("id", "formId", "data", "userId", "resourceUsageId") VALUES (22, 30, '{}', 4, 5)`,
    );
    await source.query(`INSERT INTO "form_resource_override" ("formId", "resourceId") VALUES (7, 1)`);

    await run('down');

    expect((await source.query(formRows)).map((row: { id: number }) => row.id)).toEqual([7]);
    expect((await source.query(fieldRows)).map((row: { id: number }) => row.id)).toEqual([11]);
    expect((await source.query(submissionRows)).map((row: { id: number }) => row.id)).toEqual([21]);
    expect(await source.query(`SELECT to_regclass('form_resource_override') AS t`)).toEqual([{ t: null }]);
    expect(await indexes()).toEqual([]);
    await expect(source.query(`INSERT INTO "form" ("name") VALUES ('no resource')`)).rejects.toThrow(/not-null/);

    // The migration applies again on the reverted schema.
    await run('up');
    expect(await indexes()).toHaveLength(7);
  });
});
