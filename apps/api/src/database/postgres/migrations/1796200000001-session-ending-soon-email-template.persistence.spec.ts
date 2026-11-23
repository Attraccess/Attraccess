import { EmailTemplateType } from '@attraccess/application-models';
import type { DataSource } from 'typeorm';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  readDefaultTemplateBody,
  SHIPPED_TRANSLATIONS,
} from '../../../email-template/email-defaults';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { SessionEndingSoonEmailTemplate1796200000001 } from './1796200000001-session-ending-soon-email-template';
import { postgresMigrations } from './index';

jest.setTimeout(120_000);

const TYPE = EmailTemplateType.RESOURCE_SESSION_ENDING_SOON;

describe('SessionEndingSoonEmailTemplate1796200000001 (persistence)', () => {
  let source: DataSource;
  const migration = new SessionEndingSoonEmailTemplate1796200000001();
  const run = async (direction: 'up' | 'down') => {
    const runner = source.createQueryRunner();
    try {
      await migration[direction](runner);
    } finally {
      await runner.release();
    }
  };
  const template = async () =>
    (await source.query(`SELECT "subject", "body", "variables" FROM "email_templates" WHERE "type" = $1`, [TYPE]))[0];
  const germanTexts = async (): Promise<Record<string, string>> =>
    Object.fromEntries(
      (
        await source.query(
          `SELECT "key", "value" FROM "email_template_translations" WHERE "templateType" = $1 AND "locale" = 'de'`,
          [TYPE],
        )
      ).map((row: { key: string; value: string }) => [row.key, row.value]),
    );

  beforeEach(async () => {
    const index = postgresMigrations.indexOf(SessionEndingSoonEmailTemplate1796200000001);
    source = await createTestDataSource({ migrations: postgresMigrations.slice(0, index), migrationsRun: true });
    await source.query(`DELETE FROM "email_template_translations" WHERE "templateType" = $1`, [TYPE]);
    await source.query(`DELETE FROM "email_templates" WHERE "type" = $1`, [TYPE]);
  });
  afterEach(() => closeTestDataSource(source));

  it('stores the shipped default template', async () => {
    await run('up');

    expect(await template()).toEqual({
      subject: EMAIL_TEMPLATE_DEFAULTS[TYPE].subject,
      body: readDefaultTemplateBody(TYPE),
      variables: EMAIL_TEMPLATE_DEFAULTS[TYPE].variables.join(','),
    });
  });

  it('stores the shipped German texts', async () => {
    await run('up');

    const shipped = SHIPPED_TRANSLATIONS.filter((row) => row.templateType === TYPE && row.locale === 'de');
    expect(shipped.length).toBeGreaterThan(0);
    expect(await germanTexts()).toEqual(Object.fromEntries(shipped.map((row) => [row.key, row.value])));
  });

  it('keeps a template and a German text an administrator already edited', async () => {
    await source.query(
      `INSERT INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, 'Mine', '<mj-text>mine</mj-text>', 'user.id')`,
      [TYPE],
    );
    await source.query(
      `INSERT INTO "email_template_translations" ("templateType", "key", "locale", "value") VALUES ($1, 'subject', 'de', 'Meins')`,
      [TYPE],
    );

    await run('up');

    expect(await template()).toEqual({ subject: 'Mine', body: '<mj-text>mine</mj-text>', variables: 'user.id' });
    expect((await germanTexts()).subject).toBe('Meins');
  });

  it('removes the template and its texts on the way down', async () => {
    await run('up');
    await run('down');

    expect(await template()).toBeUndefined();
    expect(await germanTexts()).toEqual({});
  });
});
