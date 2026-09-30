import { DataSource, QueryRunner } from 'typeorm';
import { EnableAllEmailDefaults1782100000000 } from './1782100000000-enable-all-email-defaults';
import { FixAccessChangeEmailDefault1782000000000 } from './1782000000000-fix-access-change-email-default';

describe.each([
  [new EnableAllEmailDefaults1782100000000(), ['resource_takeover', 'resource_session_ended', 'nfc_cards']],
  [new FixAccessChangeEmailDefault1782000000000(), ['access_changes']],
] as const)('notification default migration %s', (migration, categories) => {
  let source: DataSource;
  let runner: QueryRunner;
  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:', entities: [] }).initialize();
    runner = source.createQueryRunner();
    await runner.query('CREATE TABLE notification_preference (id INTEGER PRIMARY KEY, categoryChannels TEXT)');
  });
  afterEach(async () => {
    await runner.release();
    await source.destroy();
  });
  it('updates only existing target email flags and leaves unrelated, absent and malformed preferences intact', async () => {
    const preferences = Object.fromEntries(categories.map((category) => [category, { email: false, push: false }]));
    preferences.unrelated = { email: false, push: true };
    const alreadyEnabled = Object.fromEntries(categories.map((category) => [category, { email: true, push: true }]));
    for (const [id, value] of [
      [1, JSON.stringify(preferences)],
      [2, 'invalid-json'],
      [3, '{}'],
      [4, null],
      [5, JSON.stringify(alreadyEnabled)],
    ]) {
      await runner.query('INSERT INTO notification_preference VALUES (?, ?)', [id, value]);
    }
    await migration.up(runner);
    const rows = await runner.query('SELECT * FROM notification_preference ORDER BY id');
    const updated = JSON.parse(rows[0].categoryChannels);
    for (const category of categories) expect(updated[category]).toEqual({ email: true, push: false });
    expect(updated.unrelated).toEqual({ email: false, push: true });
    expect(rows.slice(1, 4)).toEqual([
      { id: 2, categoryChannels: 'invalid-json' },
      { id: 3, categoryChannels: '{}' },
      { id: 4, categoryChannels: null },
    ]);
    expect(JSON.parse(rows[4].categoryChannels)).toEqual(alreadyEnabled);
    await migration.up(runner);
    expect(await runner.query('SELECT * FROM notification_preference ORDER BY id')).toEqual(rows);
    await migration.down(runner);
    const reverted = await runner.query('SELECT * FROM notification_preference ORDER BY id');
    expect(JSON.parse(reverted[0].categoryChannels)).toEqual(preferences);
    for (const category of categories)
      expect(JSON.parse(reverted[4].categoryChannels)[category]).toEqual({ email: false, push: true });
    expect(reverted.slice(1, 4)).toEqual(rows.slice(1, 4));
    await migration.down(runner);
    expect(await runner.query('SELECT * FROM notification_preference ORDER BY id')).toEqual(reverted);
  });
});
