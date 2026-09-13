import { DataSource } from 'typeorm';
import { AttractapAuditDomain1784000000000 } from '../database/migrations/1784000000000-attractap-audit-domain';

describe('Attractap audit domain rollout', () => {
  let source: DataSource;
  const migration = new AttractapAuditDomain1784000000000();
  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    await source.query('CREATE TABLE setting (parent text, key text, value text, UNIQUE(parent, key))');
  });
  afterEach(async () => { await source.destroy(); });
  const domains = async () => (await source.query("SELECT value FROM setting WHERE parent = 'audit' AND key = 'domains'"))[0].value;

  it('enables Attractap on a fresh database', async () => {
    await migration.up(source.createQueryRunner());
    expect(JSON.parse(await domains())).toEqual(['resource', 'wago', 'identity', 'attractap']);
  });

  it('preserves saved domain selections and global pause through upgrade and rollback', async () => {
    await source.query("INSERT INTO setting VALUES ('audit', 'domains', ?), ('audit', 'enabled', 'false')", ['["billing","identity"]']);
    await migration.up(source.createQueryRunner());
    await migration.up(source.createQueryRunner());
    expect(JSON.parse(await domains())).toEqual(['billing', 'identity', 'attractap']);
    await migration.down(source.createQueryRunner());
    expect(JSON.parse(await domains())).toEqual(['billing', 'identity']);
    expect(await source.query("SELECT value FROM setting WHERE key = 'enabled'")).toEqual([{ value: 'false' }]);
  });

  it('leaves malformed settings available for fail-closed validation', async () => {
    await source.query("INSERT INTO setting VALUES ('audit', 'domains', 'broken')");
    await migration.up(source.createQueryRunner());
    expect(await domains()).toBe('broken');
  });
});
