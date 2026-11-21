import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { PostgresBaseline1760000000000 } from './1760000000000-baseline';
import { PREVIOUS_DEFAULT_BODIES } from './1796000000000-user-names-email-defaults';
import { PostgresUserNames1796000000000 } from './1796000000000-user-names';

const VARIABLES_BEFORE: Record<string, string> = {
  'verify-email': 'user.username,user.email,user.id,url',
  'project-invitation': 'user.username,project.name,inviter.username,invitation.id',
  'password-changed': 'user.username,user.email,user.id',
};

describe('PostgreSQL user names migration', () => {
  let source: DataSource;
  const migration = new PostgresUserNames1796000000000();
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
  const variablesOf = async (type: string): Promise<string | undefined> =>
    (await source.query(`SELECT "variables" FROM "email_templates" WHERE "type" = $1`, [type]))[0]?.variables;
  const bodyOf = async (type: string): Promise<string | undefined> =>
    (await source.query(`SELECT "body" FROM "email_templates" WHERE "type" = $1`, [type]))[0]?.body;

  beforeEach(async () => {
    source = await createTestDataSource({ empty: true, migrations: [PostgresBaseline1760000000000] });
    await source.runMigrations();
    await source.query(`INSERT INTO "user" ("id", "username", "email") VALUES (4, 'ada', 'ada@example.com')`);
    await source.query(`DELETE FROM "email_templates"`);
    for (const type of ['verify-email', 'project-invitation']) {
      await source.query(
        `INSERT INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, 's', $2, $3)`,
        [type, PREVIOUS_DEFAULT_BODIES[type], VARIABLES_BEFORE[type]],
      );
    }
    await source.query(
      `INSERT INTO "email_templates" ("type", "subject", "body", "variables") VALUES ('password-changed', 's', $1, $2)`,
      [`${PREVIOUS_DEFAULT_BODIES['password-changed']}\n<!-- customised -->`, VARIABLES_BEFORE['password-changed']],
    );
  });

  afterEach(async () => closeTestDataSource(source));

  it('adds nullable names and keeps existing users without names', async () => {
    await run('up');
    expect(await source.query(`SELECT "firstName", "lastName" FROM "user" WHERE "id" = 4`)).toEqual([
      { firstName: null, lastName: null },
    ]);
  });

  it('refreshes a stored default to the display name and leaves a customised template alone', async () => {
    await run('up');
    expect(await bodyOf('verify-email')).toContain('name=user.displayName');
    expect(await bodyOf('verify-email')).not.toContain('user.username');
    expect(await bodyOf('project-invitation')).toContain('inviter=inviter.displayName');
    expect(await bodyOf('password-changed')).toContain('name=user.username');
  });

  it('lists the name variables for every core template, customised ones included, and drops them again', async () => {
    await run('up');
    expect(await variablesOf('verify-email')).toBe(
      'user.username,user.firstName,user.lastName,user.displayName,user.email,user.id,url',
    );
    expect(await variablesOf('project-invitation')).toBe(
      'user.username,user.firstName,user.lastName,user.displayName,project.name,inviter.username,inviter.displayName,invitation.id',
    );
    expect(await variablesOf('password-changed')).toContain('user.displayName');
    await run('down');
    expect(await variablesOf('verify-email')).toBe(VARIABLES_BEFORE['verify-email']);
    expect(await variablesOf('project-invitation')).toBe(VARIABLES_BEFORE['project-invitation']);
  });

  it('restores the previous defaults and drops the columns on the way down', async () => {
    await run('up');
    await run('down');
    expect(await bodyOf('verify-email')).toBe(PREVIOUS_DEFAULT_BODIES['verify-email']);
    expect(await bodyOf('project-invitation')).toBe(PREVIOUS_DEFAULT_BODIES['project-invitation']);
    const columns = await source.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'user' AND column_name IN ('firstName','lastName')`,
    );
    expect(columns).toEqual([]);
  });
});
