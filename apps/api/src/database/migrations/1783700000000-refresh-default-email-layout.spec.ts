import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { readDefaultLayoutBody } from '../../email-template/email-defaults';
import { EmailTemplates1748886859854 } from './1748886859854-email-templates';
import { Settings1757779856387 } from './1757779856387-settings';
import { EmailLayout1782200000000 } from './1782200000000-email-layout';
import { RefreshDefaultEmailLayout1783700000000 } from './1783700000000-refresh-default-email-layout';

describe('RefreshDefaultEmailLayout1783700000000', () => {
  const migration: MigrationInterface = new RefreshDefaultEmailLayout1783700000000();
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let originalLayout: string;

  beforeEach(async () => {
    dataSource = new DataSource({ type: 'sqlite', database: ':memory:', synchronize: false, entities: [] });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();

    await new Settings1757779856387().up(queryRunner);
    await new EmailTemplates1748886859854().up(queryRunner);
    await new EmailLayout1782200000000().up(queryRunner);
    originalLayout = await readLayout();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await queryRunner.release();
    await dataSource.destroy();
  });

  async function readLayout(): Promise<string | undefined> {
    const [row] = await queryRunner.query(`SELECT "value" FROM "setting" WHERE "parent" = ? AND "key" = ?`, [
      'email_layout',
      'body',
    ]);
    return row?.value;
  }

  it('upgrades the historical stock seed to the current shipped layout on fresh and existing installs', async () => {
    expect(originalLayout).toContain('#2563EB');

    await migration.up(queryRunner);

    const body = await readLayout();
    expect(body).toBe(readDefaultLayoutBody());
    expect(body).toContain('#256D7B');
    expect(body).toContain('{{content}}');
  });

  it.each(['\r\n', '\r'])('recognizes stock content with %j line endings', async (lineEnding) => {
    await queryRunner.query(`UPDATE "setting" SET "value" = ?`, [originalLayout.replace(/\r?\n/g, lineEnding)]);

    await migration.up(queryRunner);

    expect(await readLayout()).toBe(readDefaultLayoutBody());
  });

  it.each([
    ['accent', '#2563EB', '#256D7B'],
    ['logo', '{{host.logoUrl}}', 'https://example.org/logo.png'],
    ['footer', 'Notification preferences', 'Custom notification settings'],
    ['spacing', '<mjml>', '<mjml> '],
  ])('preserves even a small %s customization', async (_name, from, to) => {
    const customLayout = originalLayout.replace(from, to);
    await queryRunner.query(`UPDATE "setting" SET "value" = ?`, [customLayout]);

    await migration.up(queryRunner);

    expect(await readLayout()).toBe(customLayout);
  });

  it('upgrades stock content even when its timestamps indicate it was saved again', async () => {
    await queryRunner.query(`UPDATE "setting" SET "createdAt" = '2020-01-01', "updatedAt" = '2021-01-01'`);

    await migration.up(queryRunner);

    expect(await readLayout()).toBe(readDefaultLayoutBody());
  });

  it('leaves other settings and individual template content untouched', async () => {
    await queryRunner.query(`INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?), (?, ?, ?)`, [
      'other_email_layout',
      'body',
      originalLayout,
      'email_layout',
      'preview',
      originalLayout,
    ]);
    await queryRunner.query(`INSERT INTO "email_templates" ("type", "subject", "body") VALUES (?, ?, ?)`, [
      'verify-email',
      'Custom subject',
      '<mj-section><mj-column><mj-text>Custom content</mj-text></mj-column></mj-section>',
    ]);
    const templates = await queryRunner.query(`SELECT * FROM "email_templates"`);
    const otherSettings = await queryRunner.query(`SELECT * FROM "setting" WHERE "id" != 1 ORDER BY "id"`);

    await migration.up(queryRunner);

    expect(await readLayout()).toBe(readDefaultLayoutBody());
    expect(await queryRunner.query(`SELECT * FROM "email_templates"`)).toEqual(templates);
    expect(await queryRunner.query(`SELECT * FROM "setting" WHERE "id" != 1 ORDER BY "id"`)).toEqual(otherSettings);
  });

  it('is idempotent without another write', async () => {
    await migration.up(queryRunner);
    const changes = await queryRunner.query(`SELECT total_changes() AS changes`);

    await migration.up(queryRunner);

    expect(await readLayout()).toBe(readDefaultLayoutBody());
    expect(await queryRunner.query(`SELECT total_changes() AS changes`)).toEqual(changes);
  });

  it('does nothing when the layout setting is absent', async () => {
    await queryRunner.query(`DELETE FROM "setting"`);

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect(await queryRunner.query(`SELECT * FROM "setting"`)).toEqual([]);
  });

  it('preserves an administrator edit made between reading and updating the layout', async () => {
    const customLayout = originalLayout.replace('Notification preferences', 'Custom notification settings');
    const query = queryRunner.query.bind(queryRunner);
    jest.spyOn(queryRunner, 'query').mockImplementationOnce(async (sql, parameters) => {
      const rows = await query(sql, parameters);
      await query(`UPDATE "setting" SET "value" = ?`, [customLayout]);
      return rows;
    });

    await migration.up(queryRunner);

    expect(await readLayout()).toBe(customLayout);
  });

  it.each(['stock', 'customized'])('retains the %s layout on downgrade', async (layoutType) => {
    await migration.up(queryRunner);
    const body =
      layoutType === 'customized'
        ? readDefaultLayoutBody().replace('Notification preferences', 'Custom notification settings')
        : readDefaultLayoutBody();
    await queryRunner.query(`UPDATE "setting" SET "value" = ?`, [body]);

    await migration.down(queryRunner);

    expect(await readLayout()).toBe(body);
  });
});
