import { DataSource, QueryRunner } from 'typeorm';
import { BackfillSamlAuthDetails1791900000000 } from './1791900000000-backfill-saml-auth-details';

describe('SAML auth detail backfill migration', () => {
  let source: DataSource;
  let runner: QueryRunner;
  const migration = new BackfillSamlAuthDetails1791900000000();

  const addUser = (id: number, externalIdentifier: string | null) =>
    runner.query(`INSERT INTO user (id, externalIdentifier) VALUES (?, ?)`, [id, externalIdentifier]);
  const addProvider = (id: number, type: 'SAML' | 'OIDC') =>
    runner.query(`INSERT INTO sso_provider (id, type) VALUES (?, ?)`, [id, type]);
  const addSession = (userId: number, providerId: number, protocol: 'SAML' | 'OIDC', subject: string) =>
    runner.query(`INSERT INTO session (userId, ssoProviderId, ssoProtocol, ssoSubject) VALUES (?, ?, ?, ?)`, [
      userId,
      providerId,
      protocol,
      subject,
    ]);
  const addBinding = (userId: number, providerType: 'SAML' | 'OIDC', providerId: number, subject: string) =>
    runner.query(
      `INSERT INTO authentication_detail (userId, type, providerType, providerId, ssoSubject) VALUES (?, 'sso', ?, ?, ?)`,
      [userId, providerType, providerId, subject],
    );
  const bindings = (): Promise<Array<Record<string, unknown>>> =>
    runner.query(
      `SELECT userId, providerType, providerId, ssoSubject FROM authentication_detail WHERE type = 'sso' ORDER BY userId`,
    );

  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:', entities: [] }).initialize();
    runner = source.createQueryRunner();
    await runner.query(`CREATE TABLE user (id INTEGER PRIMARY KEY, externalIdentifier TEXT, deletedAt TEXT)`);
    await runner.query(`CREATE TABLE sso_provider (id INTEGER PRIMARY KEY, type TEXT)`);
    await runner.query(
      `CREATE TABLE authentication_detail (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, type TEXT NOT NULL, providerType TEXT, providerId INTEGER, ssoSubject TEXT)`,
    );
    await runner.query(`CREATE UNIQUE INDEX uq_user_type ON authentication_detail (userId, type)`);
    await runner.query(
      `CREATE UNIQUE INDEX uq_binding ON authentication_detail (providerType, providerId, ssoSubject) WHERE providerType IS NOT NULL AND providerId IS NOT NULL AND ssoSubject IS NOT NULL`,
    );
    await runner.query(
      `CREATE TABLE session (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, ssoProviderId INTEGER, ssoProtocol TEXT, ssoSubject TEXT)`,
    );
  });
  afterEach(async () => {
    await runner.release();
    await source.destroy();
  });

  it('binds users to the only SAML provider and never touches externalIdentifier', async () => {
    await addProvider(1, 'OIDC');
    await addProvider(2, 'SAML');
    await addUser(1, 'name-1');
    await addUser(2, null);
    await migration.up(runner);
    expect(await bindings()).toEqual([{ userId: 1, providerType: 'SAML', providerId: 2, ssoSubject: 'name-1' }]);
    expect(await runner.query(`SELECT externalIdentifier FROM user WHERE id = 1`)).toEqual([
      { externalIdentifier: 'name-1' },
    ]);
  });

  it('uses single-provider session evidence among several providers and skips without or with conflicting evidence', async () => {
    await addProvider(2, 'SAML');
    await addProvider(3, 'SAML');
    await addProvider(4, 'SAML');
    await addUser(1, 'with-evidence');
    await addUser(2, 'no-evidence');
    await addUser(3, 'conflicting');
    await addUser(4, 'stale-provider');
    await addSession(1, 3, 'SAML', 'with-evidence');
    await addSession(1, 3, 'SAML', 'with-evidence');
    await addSession(3, 2, 'SAML', 'conflicting');
    await addSession(3, 4, 'SAML', 'conflicting');
    await addSession(4, 99, 'SAML', 'stale-provider');
    await migration.up(runner);
    expect(await bindings()).toEqual([{ userId: 1, providerType: 'SAML', providerId: 3, ssoSubject: 'with-evidence' }]);
  });

  it('does not bind an empty externalIdentifier', async () => {
    await addProvider(2, 'SAML');
    await addUser(1, '');
    await migration.up(runner);
    expect(await bindings()).toEqual([]);
  });

  it('leaves users with an OIDC prefix or an unrelated SSO binding alone', async () => {
    await addProvider(2, 'SAML');
    await addProvider(5, 'OIDC');
    await addUser(1, 'SSO:OIDC:abc');
    await addUser(2, 'other');
    await addBinding(2, 'OIDC', 5, 'different-subject');
    await migration.up(runner);
    expect(await bindings()).toEqual([
      { userId: 2, providerType: 'OIDC', providerId: 5, ssoSubject: 'different-subject' },
    ]);
  });

  it('converts a misbound OIDC row with SAML session evidence', async () => {
    await addProvider(1, 'OIDC');
    await addProvider(2, 'SAML');
    await addProvider(3, 'SAML');
    await addUser(1, 'name-1');
    await addBinding(1, 'OIDC', 1, 'name-1');
    await addSession(1, 3, 'SAML', 'name-1');
    await migration.up(runner);
    expect(await bindings()).toEqual([{ userId: 1, providerType: 'SAML', providerId: 3, ssoSubject: 'name-1' }]);
  });

  it('converts a misbound OIDC row without any session when exactly one SAML provider exists', async () => {
    await addProvider(1, 'OIDC');
    await addProvider(2, 'SAML');
    await addUser(1, 'name-1');
    await addBinding(1, 'OIDC', 1, 'name-1');
    await migration.up(runner);
    expect(await bindings()).toEqual([{ userId: 1, providerType: 'SAML', providerId: 2, ssoSubject: 'name-1' }]);
  });

  it('leaves misbound rows with OIDC sessions or an ambiguous provider unchanged', async () => {
    await addProvider(1, 'OIDC');
    await addProvider(2, 'SAML');
    await addUser(1, 'real-oidc');
    await addBinding(1, 'OIDC', 1, 'real-oidc');
    await addSession(1, 1, 'OIDC', 'real-oidc');
    await addUser(2, 'any-session');
    await addBinding(2, 'OIDC', 1, 'any-session');
    await addSession(2, 7, 'SAML', 'any-session');
    await addProvider(3, 'SAML');
    await addUser(3, 'ambiguous');
    await addBinding(3, 'OIDC', 1, 'ambiguous');
    await migration.up(runner);
    expect((await bindings()).map((row) => row.providerType)).toEqual(['OIDC', 'OIDC', 'OIDC']);
  });

  it('skips a user when the target binding already belongs to another user', async () => {
    await addProvider(2, 'SAML');
    await addUser(1, 'taken');
    await addUser(2, 'taken');
    await addBinding(2, 'SAML', 2, 'taken');
    await migration.up(runner);
    expect(await bindings()).toEqual([{ userId: 2, providerType: 'SAML', providerId: 2, ssoSubject: 'taken' }]);
  });

  it('is idempotent', async () => {
    await addProvider(2, 'SAML');
    await addUser(1, 'name-1');
    await migration.up(runner);
    const first = await bindings();
    await migration.up(runner);
    expect(await bindings()).toEqual(first);
    expect(first).toHaveLength(1);
  });

  it('down() restores the OIDC backfill shape and removes bindings without an OIDC provider', async () => {
    await addProvider(1, 'OIDC');
    await addProvider(2, 'SAML');
    await addUser(1, 'name-1');
    await addUser(2, 'name-2');
    await addUser(3, null);
    await addBinding(3, 'SAML', 2, 'linked-via-ui');
    await migration.up(runner);
    await migration.down(runner);
    expect(await bindings()).toEqual([
      { userId: 1, providerType: 'OIDC', providerId: 1, ssoSubject: 'name-1' },
      { userId: 2, providerType: 'OIDC', providerId: 1, ssoSubject: 'name-2' },
      { userId: 3, providerType: 'SAML', providerId: 2, ssoSubject: 'linked-via-ui' },
    ]);

    await runner.query(`DELETE FROM sso_provider WHERE type = 'OIDC'`);
    await runner.query(`DELETE FROM authentication_detail WHERE userId IN (1, 2)`);
    await migration.up(runner);
    await migration.down(runner);
    expect((await bindings()).map((row) => row.userId)).toEqual([3]);
  });
});
