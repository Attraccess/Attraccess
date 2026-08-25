import { DataSource, QueryRunner } from 'typeorm';
import {
  EmailLayoutInlineLogo1783500000000,
  INLINE_LOGO_GLOBAL_LAYOUT,
  PREVIOUS_DEFAULT_GLOBAL_LAYOUT,
} from './migrations/1783500000000-email-layout-inline-logo';

describe('EmailLayoutInlineLogo migration', () => {
  const migration = new EmailLayoutInlineLogo1783500000000();
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeEach(async () => {
    dataSource = new DataSource({ type: 'sqlite', database: ':memory:', synchronize: false, entities: [] });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.query(
      `CREATE TABLE "setting" ("parent" varchar NOT NULL, "key" varchar NOT NULL, "value" text NOT NULL)`,
    );
  });

  afterEach(async () => {
    await queryRunner.release();
    await dataSource.destroy();
  });

  async function insertLayout(value: string) {
    await queryRunner.query(`INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)`, [
      'email_layout',
      'body',
      value,
    ]);
  }

  async function readLayout() {
    const [row] = await queryRunner.query(`SELECT "value" FROM "setting" WHERE "parent" = 'email_layout'`);
    return row.value;
  }

  it('updates the unmodified previously shipped layout', async () => {
    await insertLayout(PREVIOUS_DEFAULT_GLOBAL_LAYOUT);

    await migration.up(queryRunner);

    expect(await readLayout()).toBe(INLINE_LOGO_GLOBAL_LAYOUT);
  });

  it('updates the logo while preserving customized layout content', async () => {
    const customizedLayout = PREVIOUS_DEFAULT_GLOBAL_LAYOUT.replace('Attraccess', 'My organization');
    await insertLayout(customizedLayout);

    await migration.up(queryRunner);

    expect(await readLayout()).toBe(customizedLayout.replace('src="{{host.logoUrl}}"', 'src="cid:attraccess-logo"'));
  });

  it('updates customized layouts with single-quoted or spaced logo attributes', async () => {
    const customizedLayout = `<mj-image src = '{{host.logoUrl}}' alt="My organization" />`;

    await insertLayout(customizedLayout);

    await migration.up(queryRunner);

    expect(await readLayout()).toBe(`<mj-image src = 'cid:attraccess-logo' alt="My organization" />`);
  });

  it('restores the logo token with its original surrounding attribute formatting', async () => {
    const customizedLayout = `<mj-image src = 'cid:attraccess-logo' alt="My organization" />`;
    await insertLayout(customizedLayout);

    await migration.down(queryRunner);

    expect(await readLayout()).toBe(`<mj-image src = '{{host.logoUrl}}' alt="My organization" />`);
  });
});
