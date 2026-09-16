import { DataSource, QueryRunner } from 'typeorm';
import { FullAuditDomains1784100000000 } from './1784100000000-full-audit-domains';

describe('Full Audit Log domain rollout', () => {
  let source: DataSource;
  let runner: QueryRunner;
  const migration = new FullAuditDomains1784100000000();
  const read = async (key: string) =>
    (await runner.query('SELECT value FROM setting WHERE parent = ? AND key = ?', ['audit', key]))[0]?.value;
  const write = (key: string, value: string) =>
    runner.query('INSERT OR REPLACE INTO setting (parent, key, value) VALUES (?, ?, ?)', ['audit', key, value]);

  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    runner = source.createQueryRunner();
    await runner.query(
      'CREATE TABLE setting (parent TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, UNIQUE(parent, key))',
    );
  });
  afterEach(async () => {
    await runner.release();
    await source.destroy();
  });

  it('adds new domains while preserving existing choices, a global pause, and retention', async () => {
    await write('domains', '["billing","resource"]');
    await write('enabled', 'false');
    await write('retention_days', '30');
    await migration.up(runner);
    await migration.up(runner);
    expect(JSON.parse(await read('domains'))).toEqual(['billing', 'resource', 'administration', 'project', 'sso']);
    expect(await read('enabled')).toBe('false');
    expect(await read('retention_days')).toBe('30');
    await migration.down();
    expect(JSON.parse(await read('domains'))).toEqual(['billing', 'resource', 'administration', 'project', 'sso']);
    expect(await read('enabled')).toBe('false');
    await migration.up(runner);
    expect(JSON.parse(await read('domains'))).toEqual(['billing', 'resource', 'administration', 'project', 'sso']);
  });

  it('strips plugin-contributed domains from the core allowlist', async () => {
    await write('domains', '["resource","wago","identity","attractap"]');
    await migration.up(runner);
    expect(JSON.parse(await read('domains'))).toEqual([
      'resource',
      'identity',
      'attractap',
      'administration',
      'project',
      'sso',
    ]);
    await migration.up(runner);
    expect(JSON.parse(await read('domains'))).toEqual([
      'resource',
      'identity',
      'attractap',
      'administration',
      'project',
      'sso',
    ]);
  });

  it('repairs non-string and duplicate entries while preserving recognized choices', async () => {
    await write('domains', '["resource",1,"resource","unknown"]');
    await migration.up(runner);
    expect(JSON.parse(await read('domains'))).toEqual(['resource', 'administration', 'project', 'sso']);
  });

  it('preserves preexisting project and SSO selections through rollback and reapplication', async () => {
    await write('domains', '["billing","project","sso"]');
    await migration.up(runner);
    await migration.down();
    expect(JSON.parse(await read('domains'))).toEqual(['billing', 'project', 'sso', 'administration']);
    await migration.up(runner);
    expect(JSON.parse(await read('domains'))).toEqual(['billing', 'project', 'sso', 'administration']);
  });

  it('leaves missing configuration to the application defaults', async () => {
    await write('enabled', 'false');
    await migration.up(runner);
    expect(await read('domains')).toBeUndefined();
    expect(await read('enabled')).toBe('false');
  });

  it.each(['not-json', '{}', 'null'])(
    'preserves invalid configuration %s rather than enabling recording',
    async (value) => {
      await write('domains', value);
      await migration.up(runner);
      await migration.down();
      expect(await read('domains')).toBe(value);
    },
  );
});
