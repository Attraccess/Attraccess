import { DataSource } from 'typeorm';
import { Setting } from '@attraccess/database-entities';
import { PostgresDatabaseFixture } from '../postgres-database.test-fixture';
import { TypeOrmSsoLinkSecretStore } from './typeorm-sso-link-secret-store';

jest.setTimeout(60_000);

describe('TypeOrmSsoLinkSecretStore on real PostgreSQL', () => {
  let fixture: PostgresDatabaseFixture;
  let first: DataSource;
  let storeA: TypeOrmSsoLinkSecretStore;
  let storeB: TypeOrmSsoLinkSecretStore;

  beforeAll(async () => {
    fixture = await PostgresDatabaseFixture.create();
    first = await fixture.open();
    storeA = new TypeOrmSsoLinkSecretStore(first.getRepository(Setting));
    storeB = new TypeOrmSsoLinkSecretStore((await fixture.open()).getRepository(Setting));
  });

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(async () => {
    await first.getRepository(Setting).clear();
  });

  it('has no secret until one is created, then keeps the first one', async () => {
    expect(await storeA.read()).toBeNull();
    expect(await storeA.createIfAbsent('enc:first')).toBe(true);
    expect(await storeB.createIfAbsent('enc:second')).toBe(false);
    expect(await storeB.read()).toBe('enc:first');
  });

  it('lets exactly one of several racing instances create the secret', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) => (index % 2 ? storeA : storeB).createIfAbsent(`enc:value-${index}`)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await first.getRepository(Setting).countBy({ parent: 'auth', key: 'sso_link_token_secret' })).toBe(1);
  });

  it('replaces the stored value, for example to encrypt a plain-text secret in place', async () => {
    await storeA.createIfAbsent('plain');

    await storeB.replace('enc:plain');

    expect(await storeA.read()).toBe('enc:plain');
  });
});
