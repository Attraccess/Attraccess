import { DataSource } from 'typeorm';
import { SSOProvider, SSOProviderOIDCConfiguration, SSOProviderSAMLConfiguration } from '@attraccess/database-entities';
import { SSOProviderType } from '@attraccess/application-models';
import type { AuditEvent, AuditRecorder } from '../../../audit/recorder/audit-event';
import { SqliteFileFixture } from '../sqlite-file.test-fixture';
import { TypeOrmSsoProviderStore } from './typeorm-sso-provider-store';

jest.setTimeout(60_000);

const oidc = {
  issuer: 'https://idp.example',
  authorizationURL: 'https://idp.example/auth',
  tokenURL: 'https://idp.example/token',
  userInfoURL: 'https://idp.example/userinfo',
  clientId: 'client',
  clientSecret: 'enc:secret',
  scopes: ['email'],
};

const event = (action: string, id = 0): AuditEvent<'sso'> =>
  ({
    domain: 'sso',
    action,
    operationId: `op-${action}-${id}`,
    actor: { id: 1, authenticationMethod: 'session' },
    subject: { type: 'sso.provider', id },
    details: {},
  }) as unknown as AuditEvent<'sso'>;

describe('TypeOrmSsoProviderStore on real SQLite', () => {
  let fixture: SqliteFileFixture;
  let first: DataSource;
  let second: DataSource;
  let recorder: { record: jest.Mock };
  let storeA: TypeOrmSsoProviderStore;
  let storeB: TypeOrmSsoProviderStore;

  const count = (
    type: typeof SSOProvider | typeof SSOProviderOIDCConfiguration | typeof SSOProviderSAMLConfiguration,
  ) => first.getRepository(type).count();

  beforeAll(async () => {
    fixture = await SqliteFileFixture.create();
    first = await fixture.open();
    second = await fixture.open();
  });

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(async () => {
    recorder = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    storeA = new TypeOrmSsoProviderStore(first, recorder as unknown as AuditRecorder);
    storeB = new TypeOrmSsoProviderStore(second, recorder as unknown as AuditRecorder);
    await first.getRepository(SSOProviderOIDCConfiguration).clear();
    await first.getRepository(SSOProviderSAMLConfiguration).clear();
    await first.query('DELETE FROM sso_provider');
  });

  const createOidc = (name = 'Keycloak') =>
    storeA.create({ name, type: SSOProviderType.OIDC, oidcConfiguration: oidc }, (created) =>
      event('created', created.id),
    );

  it('creates the provider with its configuration and records the audit event in the same transaction', async () => {
    const created = await createOidc();

    expect(created).toMatchObject({ name: 'Keycloak', type: SSOProviderType.OIDC });
    expect(created.oidcConfiguration).toMatchObject({ ssoProviderId: created.id, clientSecret: 'enc:secret' });
    expect(created.oidcConfiguration).not.toHaveProperty('ssoProvider');
    expect(created.samlConfiguration).toBeUndefined();
    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'created' }), expect.anything());
  });

  it('leaves nothing behind when the audit event cannot be recorded', async () => {
    recorder.record.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(createOidc()).rejects.toThrow('audit unavailable');

    expect(await count(SSOProvider)).toBe(0);
    expect(await count(SSOProviderOIDCConfiguration)).toBe(0);
  });

  it('leaves nothing behind when the configuration is invalid', async () => {
    await expect(
      storeA.create(
        { name: 'Broken', type: SSOProviderType.OIDC, oidcConfiguration: { ...oidc, issuer: null as never } },
        () => event('created'),
      ),
    ).rejects.toThrow();

    expect(await count(SSOProvider)).toBe(0);
  });

  it('finds providers with the configuration relations the reader asks for', async () => {
    const created = await createOidc();

    expect((await storeB.findAll()).map((provider) => provider.id)).toEqual([created.id]);
    expect(await storeB.findById(created.id)).toMatchObject({ oidcConfiguration: { clientId: 'client' } });
    expect(await storeB.findByTypeAndId(SSOProviderType.OIDC, created.id)).toMatchObject({ name: 'Keycloak' });
    expect(await storeB.findByTypeAndId(SSOProviderType.SAML, created.id)).toBeNull();
    expect(await storeB.findById(created.id + 100)).toBeNull();
  });

  it('applies a planned update and its audit event atomically, and rolls back a failing configuration write', async () => {
    const created = await createOidc();

    const updated = await storeB.update(
      created.id,
      (current) => ({ name: 'Renamed', oidcConfiguration: { issuer: `${current.oidcConfiguration?.issuer}/v2` } }),
      (after) => event('updated', after.id),
    );
    expect(updated).toMatchObject({ name: 'Renamed', oidcConfiguration: { issuer: 'https://idp.example/v2' } });

    recorder.record.mockClear();
    await expect(
      storeB.update(
        created.id,
        () => ({ name: 'Never', oidcConfiguration: { issuer: null as never } }),
        () => event('updated'),
      ),
    ).rejects.toBeDefined();
    expect(await storeA.findById(created.id)).toMatchObject({
      name: 'Renamed',
      oidcConfiguration: { issuer: 'https://idp.example/v2' },
    });
    expect(recorder.record).not.toHaveBeenCalled();
  });

  it('does not touch the stored provider when the plan refuses the update', async () => {
    const created = await createOidc();

    await expect(
      storeA.update(
        created.id,
        () => {
          throw new Error('refused');
        },
        () => event('updated'),
      ),
    ).rejects.toThrow('refused');
    expect((await storeA.findById(created.id))?.name).toBe('Keycloak');
  });

  it('records no event for an update that changes nothing and answers null for a missing provider', async () => {
    const created = await createOidc();
    recorder.record.mockClear();

    await storeA.update(
      created.id,
      () => ({}),
      () => null,
    );
    expect(recorder.record).not.toHaveBeenCalled();
    expect(
      await storeA.update(
        created.id + 100,
        () => ({}),
        () => event('updated'),
      ),
    ).toBeNull();
  });

  it('applies concurrent updates from independent connections without losing either one', async () => {
    const created = await createOidc();

    await Promise.all([
      storeA.update(
        created.id,
        () => ({ name: 'Renamed' }),
        (after) => event('updated', after.id),
      ),
      storeB.update(
        created.id,
        (current) => ({ oidcConfiguration: { clientId: `${current.oidcConfiguration?.clientId}-2` } }),
        (after) => event('updated', after.id),
      ),
    ]);

    expect(await storeA.findById(created.id)).toMatchObject({
      name: 'Renamed',
      oidcConfiguration: { clientId: 'client-2' },
    });
  });

  it('removes the provider and its configurations, and a race with an update leaves no orphan configuration', async () => {
    const created = await createOidc();

    const [, updated] = await Promise.all([
      storeA.remove(created.id, (removed) => event('deleted', removed.id)),
      storeB.update(
        created.id,
        () => ({ name: 'Late' }),
        (after) => event('updated', after.id),
      ),
    ]);

    expect(updated === null || updated.name === 'Late').toBe(true);
    expect(await storeA.findById(created.id)).toBeNull();
    expect(await count(SSOProviderOIDCConfiguration)).toBe(0);
    // Removing it again is a no-op without a second audit event.
    recorder.record.mockClear();
    await storeA.remove(created.id, () => event('deleted'));
    expect(recorder.record).not.toHaveBeenCalled();
  });
});
