import { DataSource } from 'typeorm';
import {
  ApiToken,
  AuthenticationDetail,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyOverride,
  Permission,
  User,
} from '@attraccess/database-entities';
import { AuthenticationType, PasswordPolicyRole, SSOProviderType } from '@attraccess/application-models';
import { DEFAULT_PASSWORD_POLICY } from '@attraccess/shared';
import { SqliteFileFixture } from '../sqlite-file.test-fixture';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { TransactionContextResolver } from '../transaction-context';
import { TypeOrmApiTokenStore } from './typeorm-api-token.store';
import { TypeOrmCredentialStore } from './typeorm-credential.store';
import { TypeOrmPasswordPolicyStore } from './typeorm-password-policy.store';
import { TypeOrmTotpStore } from './typeorm-totp.store';
import { PasswordPolicyConstraintError } from '../../../users-and-auth/password-policy/password-policy-store.port';

jest.setTimeout(60_000);

const tokenStoreOn = (source: DataSource) =>
  new TypeOrmApiTokenStore(source.getRepository(ApiToken), unitOfWorkFor(source));
const credentialStoreOn = (source: DataSource) =>
  new TypeOrmCredentialStore(
    source.getRepository(AuthenticationDetail),
    new TransactionContextResolver(source, unitOfWorkFor(source)),
  );
const policyStoreOn = (source: DataSource) =>
  new TypeOrmPasswordPolicyStore(
    source.getRepository(PasswordPolicy),
    source.getRepository(PasswordPolicyOverride),
    source.getRepository(PasswordHistory),
    unitOfWorkFor(source),
  );

const inAnHour = () => new Date(Date.now() + 3_600_000);

describe('auth persistence adapters on a real SQLite file', () => {
  let fixture: SqliteFileFixture;
  let first: DataSource;
  let second: DataSource;

  const historyOf = async (userId: number): Promise<string[]> =>
    (await first.getRepository(PasswordHistory).find({ where: { userId }, order: { id: 'ASC' } })).map(
      (row) => row.passwordHash,
    );
  const storedHash = async (userId: number): Promise<string | undefined> =>
    (await first.getRepository(AuthenticationDetail).findOneBy({ userId, type: AuthenticationType.LOCAL_PASSWORD }))
      ?.password;

  beforeAll(async () => {
    fixture = await SqliteFileFixture.create();
    first = await fixture.open();
    second = await fixture.open();
    await first.getRepository(User).save([
      { id: 1, username: 'one', email: 'one@example.com' },
      { id: 2, username: 'two', email: 'two@example.com' },
    ]);
    await first.getRepository(Permission).save(
      ['resources.read', 'resources.write'].map((key) => ({
        key,
        label: key,
        description: key,
        category: 'resources',
      })),
    );
  });

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(async () => {
    await first.getRepository(ApiToken).clear();
    await first.getRepository(AuthenticationDetail).clear();
    await first.getRepository(PasswordHistory).clear();
    await first.getRepository(PasswordPolicyOverride).clear();
    await first.getRepository(PasswordPolicy).clear();
  });

  describe('API tokens', () => {
    const issue = (
      store: TypeOrmApiTokenStore,
      overrides: Partial<Parameters<TypeOrmApiTokenStore['create']>[0]> = {},
    ) =>
      store.create({
        userId: 1,
        name: 'Script',
        tokenHash: `hash-${Math.random()}`,
        expiresAt: null,
        permissionKeys: ['resources.read'],
        ...overrides,
      });

    it('creates a token with its permissions and exposes no hash', async () => {
      const store = tokenStoreOn(first);
      const created = await issue(store, {
        tokenHash: 'secret-hash',
        permissionKeys: ['resources.read', 'resources.write'],
      });

      expect(created).toMatchObject({
        userId: 1,
        name: 'Script',
        lastUsedAt: null,
        revokedAt: null,
        expiresAt: null,
        permissionKeys: ['resources.read', 'resources.write'],
      });
      expect(JSON.stringify(created)).not.toContain('secret-hash');
      expect(created).not.toHaveProperty('tokenHash');
      expect(await store.findByHash('secret-hash')).toEqual(created);
      expect(await store.findByHash('unknown')).toBeNull();
    });

    it('lists only active tokens of the owner, newest first, and drops them once revoked', async () => {
      const store = tokenStoreOn(first);
      const older = await issue(store, { name: 'Older' });
      const newer = await issue(store, { name: 'Newer' });
      const foreign = await issue(store, { userId: 2, name: 'Another owner' });

      expect((await store.listActive(1, 1, 10)).data.map((token) => token.id)).toEqual([newer.id, older.id]);
      expect((await store.listActive(1, 2, 1)).data.map((token) => token.id)).toEqual([older.id]);
      expect((await store.listActive(1, 1, 10)).total).toBe(2);

      await store.revoke(older.id, new Date());

      expect((await store.listActive(1, 1, 10)).data.map((token) => token.id)).toEqual([newer.id]);
      expect((await store.listActive(2, 1, 10)).data.map((token) => token.id)).toEqual([foreign.id]);
      expect((await first.getRepository(ApiToken).findOneByOrFail({ id: older.id })).revokedAt).toBeInstanceOf(Date);
    });

    it("finds a token for its owner only while it is not revoked, and never another owner's", async () => {
      const store = tokenStoreOn(first);
      const token = await issue(store);

      expect(await store.findActiveOwned(1, token.id)).not.toBeNull();
      expect(await store.findActiveOwned(2, token.id)).toBeNull();
      await store.revoke(token.id, new Date());
      expect(await store.findActiveOwned(1, token.id)).toBeNull();
      // authentication still sees it, to answer that it is revoked
      expect(
        (await store.findByHash((await first.getRepository(ApiToken).findOneByOrFail({ id: token.id })).tokenHash))
          ?.revokedAt,
      ).toBeInstanceOf(Date);
    });

    it('replaces the permission set and metadata in one step, dropping duplicates', async () => {
      const store = tokenStoreOn(first);
      const token = await issue(store, { permissionKeys: ['resources.read'] });
      const expiresAt = inAnHour();

      const updated = await store.update(token.id, {
        name: 'Renamed',
        permissionKeys: ['resources.write', 'resources.write'],
        expiresAt,
      });

      expect(updated).toMatchObject({ name: 'Renamed', permissionKeys: ['resources.write'] });
      expect(updated?.expiresAt?.getTime()).toBe(expiresAt.getTime());
      expect((await store.findActiveOwned(1, token.id))?.permissionKeys).toEqual(['resources.write']);

      await store.update(token.id, { expiresAt: null });
      expect((await store.findActiveOwned(1, token.id))?.expiresAt).toBeNull();
      expect((await store.findActiveOwned(1, token.id))?.permissionKeys).toEqual(['resources.write']);
      expect(await store.update(9999, { name: 'x' })).toBeNull();
    });

    it('rolls the whole update back when a permission cannot be stored', async () => {
      const store = tokenStoreOn(first);
      const token = await issue(store, { permissionKeys: ['resources.read'] });

      await expect(store.update(token.id, { name: 'Renamed', permissionKeys: ['not.a.permission'] })).rejects.toThrow();

      expect(await store.findActiveOwned(1, token.id)).toMatchObject({
        name: 'Script',
        permissionKeys: ['resources.read'],
      });
    });

    it('records a use only while the token is neither revoked nor expired', async () => {
      const store = tokenStoreOn(first);
      const active = await issue(store);
      const revoked = await issue(store);
      const expired = await issue(store, { expiresAt: new Date(Date.now() - 1000) });
      await store.revoke(revoked.id, new Date());
      const usedAt = new Date();

      expect(await store.touchLastUsed(active.id, usedAt)).toBe(true);
      expect(await store.touchLastUsed(revoked.id, usedAt)).toBe(false);
      expect(await store.touchLastUsed(expired.id, usedAt)).toBe(false);
      expect((await store.findActiveOwned(1, active.id))?.lastUsedAt?.getTime()).toBe(usedAt.getTime());
      expect(
        (await store.findByHash((await first.getRepository(ApiToken).findOneByOrFail({ id: revoked.id })).tokenHash))
          ?.lastUsedAt,
      ).toBeNull();
    });

    it('keeps a consistent state when a revocation and a use race from two connections', async () => {
      const storeA = tokenStoreOn(first);
      const storeB = tokenStoreOn(second);
      const tokens = await Promise.all(Array.from({ length: 12 }, () => issue(storeA)));
      const revokedAt = new Date();
      const usedAt = new Date(revokedAt.getTime() + 1);

      const outcomes = await Promise.all(
        tokens.map(async (token) => {
          const [, used] = await Promise.all([
            storeA.revoke(token.id, revokedAt),
            storeB.touchLastUsed(token.id, usedAt),
          ]);
          return { id: token.id, used };
        }),
      );

      for (const { id, used } of outcomes) {
        const row = await first.getRepository(ApiToken).findOneByOrFail({ id });
        // The revocation always lands; a use is recorded only if it committed before it, never half of either.
        expect(row.revokedAt?.getTime()).toBe(revokedAt.getTime());
        expect(row.lastUsedAt?.getTime() ?? null).toBe(used ? usedAt.getTime() : null);
        // Once revoked, no later use is accepted.
        expect(await storeB.touchLastUsed(id, new Date())).toBe(false);
      }
    });
  });

  describe('credentials', () => {
    it('stores and finds single sign-on bindings without secrets', async () => {
      const store = credentialStoreOn(first);
      const added = await store.add(1, {
        type: AuthenticationType.SSO,
        providerType: SSOProviderType.OIDC,
        providerId: 4,
        subject: 'sub-1',
      });

      expect(added).toEqual({ id: expect.any(Number), userId: 1, type: AuthenticationType.SSO });
      expect(await store.findUserIdBySso(SSOProviderType.OIDC, 4, 'sub-1')).toBe(1);
      expect(await store.findUserIdBySso(SSOProviderType.OIDC, 4, 'other')).toBeNull();
      expect(await store.findSso(1)).toEqual({
        id: added.id,
        userId: 1,
        type: AuthenticationType.SSO,
        providerType: SSOProviderType.OIDC,
        providerId: 4,
        ssoSubject: 'sub-1',
      });
      await store.updateSsoSubject(added.id, 'sub-2');
      expect(await store.findUserIdBySso(SSOProviderType.OIDC, 4, 'sub-2')).toBe(1);
      expect(await store.findSso(2)).toBeNull();
      await store.remove(added.id);
      expect(await store.findSso(1)).toBeNull();
    });

    it('adds a credential in the caller transaction and discards it with that transaction', async () => {
      const store = credentialStoreOn(first);
      const unitOfWork = unitOfWorkFor(first);

      await expect(
        unitOfWork.run(async (scope) => {
          await store.add(1, { type: AuthenticationType.LOCAL_PASSWORD, passwordHash: 'hash-a' }, scope);
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');

      expect(await store.findLocalPasswordHash(1)).toBeNull();
    });

    it('distinguishes a missing local password from one without a hash', async () => {
      const store = credentialStoreOn(first);
      expect(await store.findLocalPasswordHash(1)).toBeNull();
      await first.getRepository(AuthenticationDetail).save({ userId: 1, type: AuthenticationType.LOCAL_PASSWORD });
      expect(await store.findLocalPasswordHash(1)).toBe('');
    });

    it('creates the local password on first change and archives the replaced hash afterwards', async () => {
      const store = credentialStoreOn(first);

      await store.replaceLocalPassword(1, 'hash-1', { rememberPrevious: 3 });
      expect(await storedHash(1)).toBe('hash-1');
      expect(await historyOf(1)).toEqual([]);

      await store.replaceLocalPassword(1, 'hash-2', { rememberPrevious: 3 });
      await store.replaceLocalPassword(1, 'hash-3', { rememberPrevious: 3 });
      expect(await storedHash(1)).toBe('hash-3');
      expect(await historyOf(1)).toEqual(['hash-1', 'hash-2']);
      expect(await store.findLocalPasswordHash(1)).toBe('hash-3');
    });

    it('keeps only the newest history entries and none when history is off', async () => {
      const store = credentialStoreOn(first);
      await store.replaceLocalPassword(1, 'hash-1', { rememberPrevious: 2 });
      for (const hash of ['hash-2', 'hash-3', 'hash-4']) {
        await store.replaceLocalPassword(1, hash, { rememberPrevious: 2 });
      }
      expect(await historyOf(1)).toEqual(['hash-2', 'hash-3']);

      await store.replaceLocalPassword(1, 'hash-5', { rememberPrevious: 0 });
      expect(await storedHash(1)).toBe('hash-5');
      expect(await historyOf(1)).toEqual(['hash-2', 'hash-3']);
    });

    it('does not archive the same hash twice in a row', async () => {
      const policy = policyStoreOn(first);
      const store = credentialStoreOn(first);
      await store.replaceLocalPassword(1, 'hash-1', { rememberPrevious: 3 });
      await policy.recordHistory(1, 'hash-1', 3);
      await store.replaceLocalPassword(1, 'hash-2', { rememberPrevious: 3 });

      expect(await historyOf(1)).toEqual(['hash-1']);
    });

    it('commits the new password and the history entry together, or neither', async () => {
      const store = credentialStoreOn(first);
      const unitOfWork = unitOfWorkFor(first);
      await store.replaceLocalPassword(1, 'hash-1', { rememberPrevious: 3 });

      await expect(
        unitOfWork.run(async (scope) => {
          await store.replaceLocalPassword(1, 'hash-2', { rememberPrevious: 3 }, scope);
          // A main-connection read of the flow that owns the transaction joins it instead of waiting for its lock.
          expect(await storedHash(1)).toBe('hash-2');
          throw new Error('rollback after the change');
        }),
      ).rejects.toThrow('rollback after the change');

      expect(await storedHash(1)).toBe('hash-1');
      expect(await historyOf(1)).toEqual([]);
    });

    it('loses neither history entry nor password when two connections change the password at once', async () => {
      const storeA = credentialStoreOn(first);
      const storeB = credentialStoreOn(second);
      await storeA.replaceLocalPassword(1, 'hash-0', { rememberPrevious: 10 });

      await Promise.all([
        storeA.replaceLocalPassword(1, 'hash-a', { rememberPrevious: 10 }),
        storeB.replaceLocalPassword(1, 'hash-b', { rememberPrevious: 10 }),
      ]);

      const final = await storedHash(1);
      expect(['hash-a', 'hash-b']).toContain(final);
      const loser = final === 'hash-a' ? 'hash-b' : 'hash-a';
      // whichever change ran second archived the hash the first one had stored
      expect(await historyOf(1)).toEqual(['hash-0', loser]);
    });

    it('removes the local password and a credential by id', async () => {
      const store = credentialStoreOn(first);
      await store.replaceLocalPassword(1, 'hash-1', { rememberPrevious: 0 });
      await store.removeLocalPassword(1);
      expect(await store.findLocalPasswordHash(1)).toBeNull();
    });
  });

  describe('authenticator enrollments', () => {
    it('stores a pending secret, enables it and removes it', async () => {
      const totp = new TypeOrmTotpStore(first.getRepository(AuthenticationDetail));
      expect(await totp.find(1)).toBeNull();

      await totp.saveSetup(1, 'enc-1');
      const pending = await totp.find(1);
      const id = pending?.id ?? -1;
      expect(pending).toMatchObject({ userId: 1, encryptedSecret: 'enc-1', enabledAt: null });

      const enabledAt = new Date();
      await totp.markEnabled(id, enabledAt);
      expect((await totp.find(1))?.enabledAt?.getTime()).toBe(enabledAt.getTime());

      await totp.saveSetup(1, 'enc-2');
      expect(await totp.find(1)).toMatchObject({ id: id, encryptedSecret: 'enc-2', enabledAt: null });

      await totp.remove(id);
      expect(await totp.find(1)).toBeNull();
    });

    it('is independent of the password credential of the same user', async () => {
      const totp = new TypeOrmTotpStore(first.getRepository(AuthenticationDetail));
      const credentials = credentialStoreOn(first);
      await credentials.replaceLocalPassword(1, 'hash-1', { rememberPrevious: 0 });
      await totp.saveSetup(1, 'enc-1');

      expect(await credentials.findLocalPasswordHash(1)).toBe('hash-1');
      expect((await totp.find(1))?.encryptedSecret).toBe('enc-1');
    });
  });

  describe('password policy', () => {
    const adminScope = <T>(source: DataSource, work: Parameters<ReturnType<typeof unitOfWorkFor>['run']>[0]) =>
      unitOfWorkFor(source).run(work) as Promise<T>;

    it('seeds the default policy once and reads it back', async () => {
      const store = policyStoreOn(first);
      expect(await store.findPolicy()).toBeNull();

      await store.seedPolicy({ ...DEFAULT_PASSWORD_POLICY });
      await store.seedPolicy({ ...DEFAULT_PASSWORD_POLICY, minLength: 99 });

      expect(await store.findPolicy()).toEqual(DEFAULT_PASSWORD_POLICY);
    });

    it('applies partial changes to the policy and returns the result', async () => {
      const store = policyStoreOn(first);
      await store.seedPolicy({ ...DEFAULT_PASSWORD_POLICY });

      const saved = await adminScope<unknown>(first, (scope) =>
        store.savePolicy({ minLength: 20, checkHIBP: false }, scope),
      );

      expect(saved).toEqual({ ...DEFAULT_PASSWORD_POLICY, minLength: 20, checkHIBP: false });
      expect(await store.findPolicy()).toEqual(saved);
    });

    it('reports a missing policy row as null', async () => {
      const store = policyStoreOn(first);
      expect(await adminScope<unknown>(first, (scope) => store.savePolicy({ minLength: 20 }, scope))).toBeNull();
    });

    it('creates an override with null rules, merges later changes and deletes it', async () => {
      const store = policyStoreOn(first);

      const created = await adminScope<unknown>(first, (scope) =>
        store.saveOverride(PasswordPolicyRole.ADMIN, { minLength: 24 }, scope),
      );
      expect(created).toEqual({
        role: PasswordPolicyRole.ADMIN,
        minLength: 24,
        maxLength: null,
        allowAllUnicode: null,
        requireUppercase: null,
        requireLowercase: null,
        requireDigit: null,
        requireSpecial: null,
        checkHIBP: null,
        checkCommonPasswords: null,
        minZxcvbnScore: null,
        historySize: null,
        rotationDays: null,
      });

      await adminScope(first, (scope) => store.saveOverride(PasswordPolicyRole.ADMIN, { requireDigit: true }, scope));
      expect(await store.findOverride(PasswordPolicyRole.ADMIN)).toMatchObject({ minLength: 24, requireDigit: true });
      expect(await store.listOverrides()).toHaveLength(1);

      expect(await adminScope(first, (scope) => store.deleteOverride(PasswordPolicyRole.ADMIN, scope))).toBe(true);
      expect(await adminScope(first, (scope) => store.deleteOverride(PasswordPolicyRole.ADMIN, scope))).toBe(false);
      expect(await store.findOverride(PasswordPolicyRole.ADMIN)).toBeNull();
    });

    it('reports a rejected rule combination as a constraint error', async () => {
      const store = policyStoreOn(first);
      await expect(
        adminScope(first, (scope) => store.saveOverride('not-a-role' as PasswordPolicyRole, { minLength: 24 }, scope)),
      ).rejects.toBeInstanceOf(PasswordPolicyConstraintError);
    });

    it('discards policy and override changes together with a failed unit of work', async () => {
      const store = policyStoreOn(first);
      await store.seedPolicy({ ...DEFAULT_PASSWORD_POLICY });

      await expect(
        unitOfWorkFor(first).run(async (scope) => {
          await store.savePolicy({ minLength: 30 }, scope);
          await store.saveOverride(PasswordPolicyRole.ADMIN, { minLength: 30 }, scope);
          throw new Error('validation failed');
        }),
      ).rejects.toThrow('validation failed');

      expect((await store.findPolicy())?.minLength).toBe(DEFAULT_PASSWORD_POLICY.minLength);
      expect(await store.listOverrides()).toEqual([]);
    });

    it('returns the newest retired hashes first and prunes to the requested size', async () => {
      const store = policyStoreOn(first);
      for (const hash of ['h1', 'h2', 'h3', 'h4']) await store.recordHistory(1, hash, 3);
      await store.recordHistory(2, 'other-user', 3);

      expect(await store.recentHistoryHashes(1, 10)).toEqual(['h4', 'h3', 'h2']);
      expect(await store.recentHistoryHashes(1, 2)).toEqual(['h4', 'h3']);
      expect(await store.recentHistoryHashes(2, 10)).toEqual(['other-user']);
    });

    it('records history inside the caller transaction', async () => {
      const store = policyStoreOn(first);
      await expect(
        unitOfWorkFor(first).run(async (scope) => {
          await store.recordHistory(1, 'h1', 3, scope);
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(await store.recentHistoryHashes(1, 10)).toEqual([]);
    });
  });
});
