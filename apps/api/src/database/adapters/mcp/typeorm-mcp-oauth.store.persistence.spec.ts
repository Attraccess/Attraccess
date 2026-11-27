import { DataSource } from 'typeorm';
import { McpOAuthClient, McpOAuthGrant, McpOAuthToken, User } from '@attraccess/database-entities';
import { PostgresDatabaseFixture } from '../postgres-database.test-fixture';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { TypeOrmMcpOAuthStore } from './typeorm-mcp-oauth.store';

jest.setTimeout(60_000);

const storeOn = (source: DataSource) =>
  new TypeOrmMcpOAuthStore(
    source.getRepository(McpOAuthClient),
    source.getRepository(McpOAuthGrant),
    source.getRepository(McpOAuthToken),
    unitOfWorkFor(source),
  );

const inAnHour = () => new Date(Date.now() + 3_600_000);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

describe('MCP OAuth store on real PostgreSQL', () => {
  let fixture: PostgresDatabaseFixture;
  let first: DataSource;
  let second: DataSource;
  let store: TypeOrmMcpOAuthStore;
  let counter = 0;

  const newClient = (suffix = `c${(counter += 1)}`) => ({
    clientId: `client-${suffix}`,
    clientName: `Client ${suffix}`,
    redirectUris: ['http://127.0.0.1:1234/callback'],
    registeredIp: '203.0.113.7',
  });
  const registered = async () => {
    const client = await store.registerClient(newClient(), 1000, hoursAgo(24));
    if (!client) throw new Error('the registry unexpectedly refused a client');
    return client;
  };
  const newGrant = (clientId: string) => ({
    id: `grant-${(counter += 1)}`,
    userId: 1,
    clientId,
    permissionKeys: ['resources.read', 'resources.write'],
    resource: 'https://example.test/api/mcp',
    expiresAt: inAnHour(),
  });
  const token = (tokenHash: string, grantId: string | null, kind: 'request' | 'code' | 'access' | 'refresh') => ({
    tokenHash,
    kind,
    grantId,
    payload: kind === 'request' ? { clientId: 'x', permissionKeys: ['a'] } : null,
    expiresAt: inAnHour(),
  });

  beforeAll(async () => {
    fixture = await PostgresDatabaseFixture.create();
    first = await fixture.open();
    second = await fixture.open();
    await first.getRepository(User).save({ id: 1, username: 'one', email: 'one@example.com' });
    store = storeOn(first);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('maps clients, including the JSON redirect URI list and the creation time', async () => {
    const client = newClient();
    const created = await store.registerClient(client, 100, hoursAgo(24));
    expect(created).toMatchObject(client);
    expect(created?.createdAt).toBeInstanceOf(Date);
    expect(await store.findClient(client.clientId)).toEqual(created);
    expect(await store.findClient('missing')).toBeNull();
  });

  it('maps grants (JSON permission list, dates, null timestamps) and records uses', async () => {
    const client = await registered();
    const grant = await store.createGrant(newGrant(client.clientId));
    expect(grant).toMatchObject({ permissionKeys: ['resources.read', 'resources.write'], lastUsedAt: null });
    expect(grant.revokedAt).toBeNull();
    const usedAt = new Date();
    await store.touchGrant(grant.id, usedAt);
    expect((await store.findGrant(grant.id))?.lastUsedAt?.getTime()).toBe(usedAt.getTime());
    expect(await store.findGrant('missing')).toBeNull();
  });

  it('finds tokens by hash and kind, with the stored payload', async () => {
    await store.insertToken(token('hash-request', null, 'request'));
    expect(await store.findToken('hash-request', 'request')).toMatchObject({
      kind: 'request',
      grantId: null,
      usedAt: null,
      payload: { clientId: 'x', permissionKeys: ['a'] },
    });
    expect(await store.findToken('hash-request', 'code')).toBeNull();
  });

  it('revokes a grant and drops every token issued under it atomically, leaving other grants alone', async () => {
    const client = await registered();
    const doomed = await store.createGrant(newGrant(client.clientId));
    const kept = await store.createGrant(newGrant(client.clientId));
    await store.insertToken(token('doomed-access', doomed.id, 'access'));
    await store.insertToken(token('doomed-refresh', doomed.id, 'refresh'));
    await store.insertToken(token('kept-access', kept.id, 'access'));

    await store.revokeGrant(doomed.id, new Date());

    expect((await store.findGrant(doomed.id))?.revokedAt).toBeInstanceOf(Date);
    expect(await store.findToken('doomed-access', 'access')).toBeNull();
    expect(await store.findToken('doomed-refresh', 'refresh')).toBeNull();
    expect((await store.findGrant(kept.id))?.revokedAt).toBeNull();
    expect(await store.findToken('kept-access', 'access')).not.toBeNull();
  });

  it('lists only the active grants of a user, newest first', async () => {
    await first.getRepository(User).save({ id: 2, username: 'two', email: 'two@example.com' });
    const client = await registered();
    const older = await store.createGrant({ ...newGrant(client.clientId), userId: 2 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await store.createGrant({ ...newGrant(client.clientId), userId: 2 });
    const revoked = await store.createGrant({ ...newGrant(client.clientId), userId: 2 });
    await store.revokeGrant(revoked.id, new Date());
    await store.createGrant({ ...newGrant(client.clientId), userId: 2, expiresAt: hoursAgo(1) });
    await store.createGrant({ ...newGrant(client.clientId), userId: 1 });

    expect((await store.listActiveGrantsForUser(2)).map((grant) => grant.id)).toEqual([newer.id, older.id]);
  });

  describe('single use across independent connections', () => {
    it('lets exactly one of many concurrent consumers rotate a refresh token', async () => {
      const client = await registered();
      const grant = await store.createGrant(newGrant(client.clientId));
      await store.insertToken(token('rotating-refresh', grant.id, 'refresh'));
      const sources = [first, second, await fixture.open(), await fixture.open()];

      const results = await Promise.all(
        sources.flatMap((source) => [0, 1].map(() => storeOn(source).consumeToken('rotating-refresh', new Date()))),
      );

      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await store.findToken('rotating-refresh', 'refresh'))?.usedAt).toBeInstanceOf(Date);
      expect(await store.consumeToken('rotating-refresh', new Date())).toBe(false);
      expect(await store.consumeToken('never-stored', new Date())).toBe(false);
    });

    it('lets exactly one of two concurrent answers to an authorization request win', async () => {
      await store.insertToken(token('contested-request', null, 'request'));
      const [a, b] = await Promise.all([
        storeOn(first).consumeToken('contested-request', new Date()),
        storeOn(second).consumeToken('contested-request', new Date()),
      ]);
      expect([a, b].sort()).toEqual([false, true]);
    });

    it('revokes a grant while another connection consumes its refresh token without losing either effect', async () => {
      const client = await registered();
      const grant = await store.createGrant(newGrant(client.clientId));
      await store.insertToken(token('racing-refresh', grant.id, 'refresh'));

      await Promise.all([
        storeOn(first).revokeGrant(grant.id, new Date()),
        storeOn(second).consumeToken('racing-refresh', new Date()),
      ]);

      expect((await store.findGrant(grant.id))?.revokedAt).toBeInstanceOf(Date);
      expect(await store.findToken('racing-refresh', 'refresh')).toBeNull();
    });
  });

  describe('client registry limit', () => {
    it('refuses a registration at the limit unless stale unused registrations make room', async () => {
      const total = await first.getRepository(McpOAuthClient).count();
      const limit = total + 1;
      const old = await store.registerClient(newClient('old'), limit, hoursAgo(24));
      expect(old).not.toBeNull();
      // Full: the fresh registration finds nothing stale to drop.
      expect(await store.registerClient(newClient('rejected'), limit, hoursAgo(24))).toBeNull();
      // Everything registered so far counts as stale; only clients that hold a grant survive the cleanup.
      const [{ clientId: grantHolder }] = await first.getRepository(McpOAuthGrant).find();
      const admitted = await store.registerClient(newClient('admitted'), limit, new Date(Date.now() + 1000));
      expect(admitted).not.toBeNull();
      expect(await store.findClient((old as { clientId: string }).clientId)).toBeNull();
      expect(await store.findClient(grantHolder)).not.toBeNull();
    });

    it('admits at most the limit when registrations race on independent connections', async () => {
      const total = await first.getRepository(McpOAuthClient).count();
      const limit = total + 3;
      const sources = [first, second, await fixture.open(), await fixture.open()];

      const results = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          storeOn(sources[index % sources.length]).registerClient(newClient(`race-${index}`), limit, hoursAgo(24)),
        ),
      );

      expect(results.filter(Boolean)).toHaveLength(3);
      expect(await first.getRepository(McpOAuthClient).count()).toBe(limit);
    });
  });

  it('purges unanswered requests as soon as they expire, and other expired data only after the grace cutoff', async () => {
    const client = await registered();
    const oldGrant = await first.getRepository(McpOAuthGrant).save({
      ...newGrant(client.clientId),
      id: 'expired-grant',
      expiresAt: hoursAgo(48),
    });
    const liveGrant = await store.createGrant(newGrant(client.clientId));
    const expired = (hash: string, kind: 'request' | 'access', ageHours: number, grantId: string | null) => ({
      ...token(hash, grantId, kind),
      expiresAt: hoursAgo(ageHours),
    });
    await store.insertToken(expired('purge-request-recent', 'request', 1, null));
    await store.insertToken(expired('purge-access-recent', 'access', 1, liveGrant.id));
    await store.insertToken(expired('purge-access-old', 'access', 30, liveGrant.id));

    await store.purgeExpired(new Date(), hoursAgo(24));

    expect(await store.findToken('purge-request-recent', 'request')).toBeNull();
    expect(await store.findToken('purge-access-recent', 'access')).not.toBeNull();
    expect(await store.findToken('purge-access-old', 'access')).toBeNull();
    expect(await store.findGrant(oldGrant.id)).toBeNull();
    expect(await store.findGrant(liveGrant.id)).not.toBeNull();
  });
});
