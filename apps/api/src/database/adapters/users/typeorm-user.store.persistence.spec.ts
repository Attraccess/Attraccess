import {
  AuthenticationType,
  ResourceType,
  ResourceUsageAction,
  SSOProviderType,
  UserRoleSource,
  type NewUser,
} from '@attraccess/application-models';
import {
  AuthenticationDetail,
  DashboardPin,
  Resource,
  ResourceUsage,
  Role,
  Session,
  User,
  UserRole,
} from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { publishedState } from '../../../resources/usage/sessions/published-state';
import { PostgresDatabaseFixture } from '../postgres-database.test-fixture';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { TransactionContextResolver } from '../transaction-context';
import { TypeOrmUserStore } from './typeorm-user.store';

const storeFor = (source: DataSource) =>
  new TypeOrmUserStore(source, new TransactionContextResolver(source, unitOfWorkFor(source)));

const aNewUser = (username: string, overrides: Partial<NewUser> = {}): NewUser => ({
  username,
  email: `${username}@example.com`,
  externalIdentifier: null,
  isEmailVerified: false,
  locale: 'en',
  ...overrides,
});

describe('user store on real PostgreSQL', () => {
  let fixture: PostgresDatabaseFixture;
  let source: DataSource;
  let store: TypeOrmUserStore;

  beforeAll(async () => {
    fixture = await PostgresDatabaseFixture.create();
    source = await fixture.open();
    store = storeFor(source);
  }, 30_000);

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(async () => {
    // a table at a time: the schema comes from synchronize, so there are no cascades to rely on
    for (const table of [
      'session',
      'resource_usage',
      'resource',
      'user_role',
      'role',
      'authentication_detail',
      'user',
    ]) {
      await source.query(`DELETE FROM "${table}"`);
    }
  });

  describe('mapping', () => {
    it('inserts users in order and returns complete records with the column defaults', async () => {
      const saved = await store.insertUsers([aNewUser('first'), aNewUser('second', { locale: 'de' })]);

      expect(saved.map((user) => user.username)).toEqual(['first', 'second']);
      expect(saved[0]).toMatchObject({ firstName: null, lastName: null });
      const [named] = await store.insertUsers([aNewUser('named', { firstName: 'Ada', lastName: 'Lovelace' })]);
      expect(named).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
      expect(saved[1]).toMatchObject({
        email: 'second@example.com',
        locale: 'de',
        isEmailVerified: false,
        isDisabled: false,
        billingFactor: 100,
        creditBalance: 0,
        failedLoginAttempts: 0,
        emailVerificationToken: null,
        passwordResetToken: null,
        lockedUntil: null,
        deleteAccountToken: null,
        deletedAt: null,
      });
      expect(saved[0].id).toEqual(expect.any(Number));
      expect(saved[0].createdAt).toBeInstanceOf(Date);
    });

    it('finds by id, username and exact email; relations only when asked', async () => {
      const [user] = await store.insertUsers([aNewUser('alice'), aNewUser('a_btag')]);
      await source
        .getRepository(AuthenticationDetail)
        .save({ userId: user.id, type: AuthenticationType.LOCAL_PASSWORD });

      expect(await store.findUser({ id: user.id })).toMatchObject({ username: 'alice' });
      expect(await store.findUser({ username: 'alice' })).toMatchObject({ id: user.id });
      expect(await store.findUser({ email: 'alice@example.com' })).toMatchObject({ id: user.id });
      expect(await store.findUser({ email: 'a__tag@example.com' })).toBeNull();
      expect((await store.findUser({ id: user.id }))?.authenticationDetails).toBeUndefined();
      const withCredentials = await store.findUser({ id: user.id }, true);
      expect(withCredentials?.authenticationDetails).toEqual([
        {
          id: expect.any(Number),
          userId: user.id,
          type: AuthenticationType.LOCAL_PASSWORD,
          providerType: null,
          providerId: null,
          ssoSubject: null,
        },
      ]);
    });

    it('never maps a credential secret into a record', async () => {
      const [user] = await store.insertUsers([aNewUser('alice')]);
      await source.getRepository(AuthenticationDetail).save({
        userId: user.id,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'bcrypt-hash',
        totpSecret: 'totp-secret',
      });

      const found = await store.findUser({ id: user.id }, true);

      expect(JSON.stringify(found)).not.toMatch(/bcrypt-hash|totp-secret/);
    });

    it('skips soft-deleted users and finds users by emails or usernames', async () => {
      const [alice, bob] = await store.insertUsers([aNewUser('alice'), aNewUser('bob')]);
      await source.getRepository(User).softDelete(bob.id);

      expect(await store.findUser({ id: bob.id })).toBeNull();
      expect((await store.findByEmailsOrUsernames(['alice@example.com'], [])).map((user) => user.id)).toEqual([
        alice.id,
      ]);
      expect(await store.findByEmailsOrUsernames([], ['bob'])).toEqual([]);
      expect(await store.findByEmailsOrUsernames([], [])).toEqual([]);
      expect(await store.countUsers()).toBe(1);
      expect(await store.countUsers({ excludingUserId: alice.id })).toBe(0);
    });

    it('finds the user bound to a single sign-on identity', async () => {
      const [alice] = await store.insertUsers([aNewUser('alice'), aNewUser('bob')]);
      await source.getRepository(AuthenticationDetail).save({
        userId: alice.id,
        type: AuthenticationType.SSO,
        providerType: SSOProviderType.OIDC,
        providerId: 3,
        ssoSubject: 'subject-1',
      });

      expect(await store.findUserBySso(SSOProviderType.OIDC, 3, 'subject-1')).toMatchObject({ id: alice.id });
      expect(await store.findUserBySso(SSOProviderType.OIDC, 3, 'other')).toBeNull();
      expect(await store.hasSsoCredential(alice.id)).toBe(true);
      expect(await store.hasSsoCredential(alice.id + 1)).toBe(false);
    });

    it('changes only the defined columns, clears columns set to null and sends nothing for an empty patch', async () => {
      const [alice] = await store.insertUsers([aNewUser('alice')]);
      await store.updateUser(alice.id, { passwordResetToken: 'reset', locale: 'de' });

      await store.updateUser(alice.id, { passwordResetToken: null, locale: undefined });
      await store.updateUser(alice.id, {});

      expect(await store.findUser({ id: alice.id })).toMatchObject({ passwordResetToken: null, locale: 'de' });
    });
  });

  describe('listing', () => {
    let ids: Record<string, number>;
    beforeEach(async () => {
      const saved = await store.insertUsers([
        aNewUser('alice', { isEmailVerified: true }),
        aNewUser('bob'),
        aNewUser('carol'),
        aNewUser('dave', { email: 'ärger@example.com' }),
      ]);
      ids = Object.fromEntries(saved.map((user) => [user.username, user.id]));
      const roles = source.getRepository(Role);
      const [viewer, maker] = await roles.save([
        { key: 'viewer', name: 'Viewer', description: '', isSystemManaged: false, isDefault: false },
        { key: 'maker', name: 'Maker', description: '', isSystemManaged: false, isDefault: false },
      ]);
      const assign = (userId: number, roleId: number) =>
        source.getRepository(UserRole).save({ userId, roleId, source: UserRoleSource.MANUAL });
      await assign(ids['alice'], viewer.id);
      await assign(ids['alice'], maker.id);
      await assign(ids['bob'], viewer.id);
      const sso = (userId: number, providerId: number) =>
        source.getRepository(AuthenticationDetail).save({
          userId,
          type: AuthenticationType.SSO,
          providerType: SSOProviderType.OIDC,
          providerId,
          ssoSubject: `subject-${userId}-${providerId}`,
        });
      await sso(ids['carol'], 7);
      await sso(ids['dave'], 8);
      (ids as Record<string, number>)['viewer'] = viewer.id;
      (ids as Record<string, number>)['maker'] = maker.id;
    });

    const names = async (query: Partial<Parameters<TypeOrmUserStore['listUsers']>[0]> = {}) =>
      (await store.listUsers({ page: 1, limit: 10, ...query })).users.map((user) => user.username);

    it('orders by username and paginates with the total of all matches', async () => {
      expect(await names()).toEqual(['alice', 'bob', 'carol', 'dave']);
      const page = await store.listUsers({ page: 2, limit: 3 });
      expect(page.users.map((user) => user.username)).toEqual(['dave']);
      expect(page.total).toBe(4);
    });

    it('lists credentials with every user and roles only on request', async () => {
      const [alice] = (await store.listUsers({ page: 1, limit: 10 })).users;
      expect(alice.authenticationDetails).toEqual([]);
      expect(alice.userRoles).toBeUndefined();
      const withRoles = (await store.listUsers({ page: 1, limit: 10, includeRoles: true })).users;
      expect(withRoles[0].userRoles?.map((assignment) => assignment.role?.key).sort()).toEqual(['maker', 'viewer']);
    });

    it('filters by id list, role assignment and search, keeping the role filter when searching', async () => {
      expect(await names({ ids: [ids['bob'], ids['carol']] })).toEqual(['bob', 'carol']);
      expect(await names({ roleId: ids['viewer'] })).toEqual(['alice', 'bob']);
      expect(await names({ roleId: ids['viewer'], search: 'ali' })).toEqual(['alice']);
      expect(await names({ search: 'ARO' })).toEqual(['carol']);
    });

    it('finds users by first name, last name and both on the plain and the filtered path', async () => {
      await store.updateUser(ids['bob'], { firstName: 'Ada', lastName: 'Lovelace' });
      await store.updateUser(ids['carol'], { firstName: 'Grace', lastName: null });
      expect(await names({ search: 'ada' })).toEqual(['bob']);
      expect(await names({ search: 'LOVE' })).toEqual(['bob']);
      expect(await names({ search: 'ada lov' })).toEqual(['bob']);
      expect(await names({ search: 'grace' })).toEqual(['carol']);
      expect(await names({ search: 'bob' })).toEqual(['bob']);
      // the filtered path (emailVerified makes the query use role and provider filters)
      expect(await names({ search: 'ada lov', emailVerified: false })).toEqual(['bob']);
      expect(await names({ search: 'lovelace', emailVerified: true })).toEqual([]);
      expect(await names({ search: 'alice', emailVerified: true })).toEqual(['alice']);
    });

    it('sorts by display name, case-insensitively, then by id', async () => {
      await store.updateUser(ids['alice'], { firstName: 'zed', lastName: 'Zimmer' });
      await store.updateUser(ids['dave'], { firstName: 'Anna', lastName: null });
      await store.updateUser(ids['carol'], { firstName: '  ', lastName: null });
      // dave = "Anna", bob = "bob", carol (blank names) = "carol", alice = "zed Zimmer"
      expect(await names()).toEqual(['dave', 'bob', 'carol', 'alice']);
      expect(await names({ emailVerified: false })).toEqual(['dave', 'bob', 'carol']);
    });

    it('folds the email search term in JavaScript, including non-ASCII letters', async () => {
      expect(await names({ search: 'ÄRGER@Example.com' })).toEqual(['dave']);
    });

    it('requires any or every selected role and excludes roles', async () => {
      const both = [ids['viewer'], ids['maker']];
      expect(await names({ roleIds: [...both, ...both] })).toEqual(['alice', 'bob']);
      expect(await names({ roleIds: both, roleMatch: 'all' })).toEqual(['alice']);
      expect(await names({ excludeRoleIds: [ids['viewer']] })).toEqual(['carol', 'dave']);
    });

    it('filters by email verification status', async () => {
      expect(await names({ emailVerified: true })).toEqual(['alice']);
      expect(await names({ emailVerified: false })).toEqual(['bob', 'carol', 'dave']);
    });

    it('filters by single sign-on provider', async () => {
      expect(await names({ hasSsoProvider: true })).toEqual(['carol', 'dave']);
      expect(await names({ hasSsoProvider: false })).toEqual(['alice', 'bob']);
      expect(await names({ ssoProviderIds: [7, 7] })).toEqual(['carol']);
      expect(await names({ ssoProviderIds: [7, 8] })).toEqual(['carol', 'dave']);
      // duplicates count once, and one user can be bound to only one provider
      expect(await names({ ssoProviderIds: [7, 7], ssoProviderMatch: 'all' })).toEqual(['carol']);
      expect(await names({ ssoProviderIds: [7, 8], ssoProviderMatch: 'all' })).toEqual([]);
      expect(await names({ ssoProviderIds: [8], ssoProviderNone: true })).toEqual(['alice', 'bob', 'dave']);
      expect(await names({ ssoProviderNone: true })).toEqual(['alice', 'bob']);
      expect(await names({ excludeSsoProviderIds: [8, 8] })).toEqual(['alice', 'bob', 'carol']);
    });
  });

  describe('single-use tokens across independent connections', () => {
    let second: DataSource;
    let secondStore: TypeOrmUserStore;

    beforeAll(async () => {
      second = await fixture.open();
      secondStore = storeFor(second);
    });

    it.each(['verification', 'reset'] as const)(
      'lets exactly one of two racing %s token consumptions win, in every round',
      async (kind) => {
        for (let round = 0; round < 15; round++) {
          const [user] = await store.insertUsers([aNewUser(`racer${kind}${round}`)]);
          const token = `token-${kind}-${round}`;
          await store.updateUser(
            user.id,
            kind === 'verification'
              ? { emailVerificationToken: token, emailVerificationTokenExpiresAt: new Date(Date.now() + 60_000) }
              : { passwordResetToken: token, passwordResetTokenExpiresAt: new Date(Date.now() + 60_000) },
          );
          const consume = (target: TypeOrmUserStore) =>
            kind === 'verification'
              ? target.consumeEmailVerificationToken(user.id, token)
              : target.consumePasswordResetToken(user.id, token);

          const outcomes = await Promise.all([
            consume(store),
            consume(secondStore),
            consume(store),
            consume(secondStore),
          ]);

          expect(outcomes.filter(Boolean)).toHaveLength(1);
          const after = await store.findUser({ id: user.id });
          if (kind === 'verification') {
            expect(after).toMatchObject({ isEmailVerified: true, emailVerificationToken: null });
          } else {
            expect(after).toMatchObject({ passwordResetToken: null, passwordResetTokenExpiresAt: null });
          }
        }
      },
      60_000,
    );

    it('refuses a token that was replaced or never issued', async () => {
      const [user] = await store.insertUsers([aNewUser('alice')]);
      await store.updateUser(user.id, { emailVerificationToken: 'current' });

      expect(await store.consumeEmailVerificationToken(user.id, 'stale')).toBe(false);
      expect(await store.consumePasswordResetToken(user.id, 'anything')).toBe(false);
      expect(await store.findUser({ id: user.id })).toMatchObject({
        isEmailVerified: false,
        emailVerificationToken: 'current',
      });
    });

    it('rolls a consumption back with the unit of work it joined', async () => {
      const [user] = await store.insertUsers([aNewUser('alice')]);
      await store.updateUser(user.id, { passwordResetToken: 'reset' });
      const uow = unitOfWorkFor(source);

      await expect(
        uow.run(async (scope) => {
          expect(await store.consumePasswordResetToken(user.id, 'reset', scope)).toBe(true);
          throw new Error('later step failed');
        }),
      ).rejects.toThrow('later step failed');

      expect(await store.findUser({ id: user.id })).toMatchObject({ passwordResetToken: 'reset' });
    });
  });

  describe('email change compensation', () => {
    it('puts back the previous email only while the issued token is still current', async () => {
      const [user] = await store.insertUsers([aNewUser('alice', { isEmailVerified: true })]);
      const previous = {
        email: 'alice@example.com',
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
      };
      await store.updateUser(user.id, {
        email: 'new@example.com',
        isEmailVerified: false,
        emailVerificationToken: 't1',
      });

      await store.updateUser(user.id, { emailVerificationToken: 't2' });
      expect(await store.revertEmailChange(user.id, 't1', previous)).toBe(false);
      expect(await store.findUser({ id: user.id })).toMatchObject({ email: 'new@example.com' });

      expect(await store.revertEmailChange(user.id, 't2', previous)).toBe(true);
      expect(await store.findUser({ id: user.id })).toMatchObject({
        email: 'alice@example.com',
        isEmailVerified: true,
        emailVerificationToken: null,
      });
    });
  });

  describe('first-time setup and discarding', () => {
    it('claims the sole unverified account once and refuses when anything else is active', async () => {
      const [setup] = await store.insertUsers([aNewUser('setup')]);
      const identity = { username: 'first-time-setup-1-x', email: 'first-time-setup-1-x@deleted.local' };

      expect(await store.claimFirstTimeSetupAccount(setup.id, identity)).toBe(true);
      expect(await store.findUser({ id: setup.id })).toMatchObject({ username: identity.username });

      const [other] = await store.insertUsers([aNewUser('other')]);
      expect(await store.claimFirstTimeSetupAccount(setup.id, identity)).toBe(false);

      await store.discardUser(other.id);
      await store.updateUser(setup.id, { isEmailVerified: true });
      expect(await store.claimFirstTimeSetupAccount(setup.id, identity)).toBe(false);
    });

    it('restores the first-time setup identity and removes the replacement together', async () => {
      const [setup, replacement] = await store.insertUsers([aNewUser('setup'), aNewUser('replacement')]);

      await store.restoreFirstTimeSetupAccount(replacement.id, {
        id: setup.id,
        username: 'original',
        email: 'original@example.com',
      });

      expect((await store.findFirstUser())?.username).toBe('original');
      expect(await store.countUsers()).toBe(1);
    });

    it('discards only unaccepted invitations', async () => {
      const [pending, accepted] = await store.insertUsers([
        aNewUser('pending'),
        aNewUser('accepted', { isEmailVerified: true }),
      ]);

      await store.discardUnacceptedInvitations([pending.id, accepted.id]);
      await store.discardUnacceptedInvitations([]);

      expect((await source.getRepository(User).find()).map((user) => user.username)).toEqual(['accepted']);
    });

    it('does not keep an inserted user when the unit of work it joined fails', async () => {
      const uow = unitOfWorkFor(source);

      await expect(
        uow.run(async (scope) => {
          await store.insertUser(aNewUser('ghost'), scope);
          expect(await store.findUser({ username: 'ghost' }, false, scope)).not.toBeNull();
          throw new Error('role assignment failed');
        }),
      ).rejects.toThrow('role assignment failed');

      expect(await store.findUser({ username: 'ghost' })).toBeNull();
    });
  });

  describe('self deletion', () => {
    const identity = { username: 'deleted-user-x', email: 'deleted-user-x@deleted.local' };

    it('anonymizes the account, drops credentials and sessions and retains the confirmation token', async () => {
      const [user] = await store.insertUsers([aNewUser('leaver', { externalIdentifier: 'ext' })]);
      await source
        .getRepository(AuthenticationDetail)
        .save({ userId: user.id, type: AuthenticationType.LOCAL_PASSWORD });
      await source
        .getRepository(Session)
        .save({ token: 'session-token', userId: user.id, expiresAt: new Date(Date.now() + 1000) });
      await source
        .getRepository(DashboardPin)
        .insert({ userId: user.id, itemType: 'page', itemId: '/projects', position: 0 });
      await store.recordDeleteAccountRequest(user.id, {
        tokenHash: 'hashed',
        expiresAt: new Date(Date.now() + 60_000),
        requestedAt: new Date(),
      });
      await store.updateUser(user.id, {
        emailVerificationToken: 'v',
        passwordResetToken: 'p',
        firstName: 'Ada',
        lastName: 'Lovelace',
      });

      expect(await store.anonymizeUser(user.id, identity)).toEqual({ outcome: 'anonymized', locale: 'en' });

      expect(await source.getRepository(AuthenticationDetail).count()).toBe(0);
      expect(await source.getRepository(Session).count()).toBe(0);
      // The soft-deleted row stays, so the database never cascades to the pins.
      expect(await source.getRepository(DashboardPin).count()).toBe(0);
      expect(await store.findUser({ id: user.id })).toBeNull();
      const retained = await source.getRepository(User).findOne({ where: { id: user.id }, withDeleted: true });
      expect(retained).toMatchObject({
        ...identity,
        isEmailVerified: false,
        externalIdentifier: null,
        firstName: null,
        lastName: null,
        emailVerificationToken: null,
        passwordResetToken: null,
        deleteAccountToken: 'hashed',
      });
      expect(retained?.deletedAt).toBeInstanceOf(Date);
      expect(await store.anonymizeUser(user.id, identity)).toEqual({ outcome: 'already-deleted' });
      expect(await store.anonymizeUser(user.id + 100, identity)).toEqual({ outcome: 'not-found' });
    });

    it('refuses while the user has a running usage session and changes nothing', async () => {
      const [user] = await store.insertUsers([aNewUser('busy')]);
      const resource = await source.getRepository(Resource).save({ name: 'Lathe', type: ResourceType.Machine });
      await source.getRepository(ResourceUsage).save({
        ...publishedState,
        usageAction: ResourceUsageAction.Usage,
        resourceId: resource.id,
        userId: user.id,
        startTime: new Date(),
      });

      expect(await store.anonymizeUser(user.id, identity)).toEqual({ outcome: 'active-usage' });
      expect(await store.findUser({ id: user.id })).toMatchObject({ username: 'busy' });
    });

    it('finds the confirmation by email, or by the retained token once the email was anonymized and reused', async () => {
      const [leaver, other] = await store.insertUsers([aNewUser('leaver'), aNewUser('other')]);
      await store.recordDeleteAccountRequest(leaver.id, {
        tokenHash: 'hashed:tok',
        expiresAt: new Date(Date.now() + 60_000),
        requestedAt: new Date(),
      });

      expect(await store.findForDeletionConfirmation('leaver@example.com', ['hashed:tok', 'tok'])).toMatchObject({
        id: leaver.id,
        deleteAccountToken: 'hashed:tok',
      });

      await store.anonymizeUser(leaver.id, identity);
      await store.updateUser(other.id, { email: 'leaver@example.com' });

      const found = await store.findForDeletionConfirmation('leaver@example.com', ['hashed:tok', 'tok']);
      expect(found).toMatchObject({ id: leaver.id });
      expect(found?.deletedAt).toBeInstanceOf(Date);
      expect(await store.findForDeletionConfirmation('nobody@example.com', ['unknown'])).toBeNull();
    });
  });
});
