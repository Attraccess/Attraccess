import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { UserRecord } from '@attraccess/application-models';
import { DataSource } from 'typeorm';
import { RbacService } from '../../../users-and-auth/rbac/rbac.service';
import { UserAccounts } from '../../../users-and-auth/users/accounts/user-accounts';
import { UserIdentityTakenError } from '../../../users-and-auth/users/user-store.port';
import { PostgresDatabaseFixture } from '../postgres-database.test-fixture';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { TransactionContextResolver } from '../transaction-context';
import { TypeOrmRbacStore } from './typeorm-rbac.store';
import { TypeOrmUserStore } from './typeorm-user.store';

jest.setTimeout(60_000);

/** UserAccounts on a connection pool of its own, like one API instance. */
interface Instance {
  source: DataSource;
  store: TypeOrmUserStore;
  accounts: UserAccounts;
  uow: ReturnType<typeof unitOfWorkFor>;
}

const metrics = {
  usersRegisteredTotal: { inc: () => undefined },
  usersTotal: { inc: () => undefined },
  usersPerLocale: { inc: () => undefined },
};

describe('account creation on real PostgreSQL, across independent connections', () => {
  let fixture: PostgresDatabaseFixture;
  let first: Instance;
  let second: Instance;

  const instance = async (): Promise<Instance> => {
    const source = await fixture.open();
    const uow = unitOfWorkFor(source);
    const transactions = new TransactionContextResolver(source, uow);
    const store = new TypeOrmUserStore(source, transactions);
    const rbac = new RbacService(new TypeOrmRbacStore(source, transactions), uow, new EventEmitter2(), null, {
      record: jest.fn(),
    } as never);
    const license = { verifyLicense: jest.fn().mockResolvedValue(undefined) };
    const accounts = new UserAccounts(store, license as never, uow, metrics as never, rbac);
    return { source, store, accounts, uow };
  };

  const administrators = async (): Promise<string[]> =>
    (
      await first.source.query(
        `SELECT u."username" FROM "user_role" ur JOIN "role" r ON r."id" = ur."roleId" JOIN "user" u ON u."id" = ur."userId"
         WHERE r."key" = 'administrator' AND u."deletedAt" IS NULL ORDER BY u."username"`,
      )
    ).map((row: { username: string }) => row.username);

  const aUser = (username: string) => ({ username, email: `${username}@example.com`, externalIdentifier: null });

  /** What the registration service does for a replacement of the first-time-setup account, in one transaction. */
  const replaceSetupAccount = (on: Instance, username: string): Promise<UserRecord> =>
    on.uow.run(async (scope) => {
      const setup = await on.accounts.releaseFirstTimeSetupAdminIdentifiers(scope);
      return on.accounts.createOne({ ...aUser(username), isFirstTimeSetupAdmin: true }, scope, {
        excludedUserIdFromLicenseUsage: setup.id,
      });
    });

  beforeAll(async () => {
    fixture = await PostgresDatabaseFixture.create();
    first = await instance();
    second = await instance();
  }, 60_000);

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(async () => {
    for (const table of ['user_role', 'authentication_detail', 'session', 'user', 'role']) {
      await first.source.query(`DELETE FROM "${table}"`);
    }
    await first.source.query(
      `INSERT INTO "role" ("key", "name", "description", "isSystemManaged", "isDefault")
       VALUES ('administrator', 'Admin', '', true, false), ('member', 'Member', '', false, true)`,
    );
  });

  it('makes only one of two concurrent first registrations an administrator', async () => {
    const results = await Promise.allSettled([
      first.accounts.createOne(aUser('alice')),
      second.accounts.createOne(aUser('bob')),
    ]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await administrators()).toHaveLength(1);
  });

  it('lets only one of two concurrent first-time-setup replacements claim the setup account', async () => {
    await first.accounts.createOne(aUser('setup'));
    expect(await administrators()).toEqual(['setup']);

    const results = await Promise.allSettled([replaceSetupAccount(first, 'alice'), replaceSetupAccount(second, 'bob')]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ForbiddenException);
    // The claimed setup account is removed after the verification email, outside this flow.
    expect(await administrators()).toHaveLength(2);
    expect((await administrators()).filter((name) => name === 'alice' || name === 'bob')).toHaveLength(1);
  });

  it('answers 400 for a username another connection took in the meantime', async () => {
    let releaseTaker!: () => void;
    const taker = new Promise<void>((resolve) => {
      releaseTaker = resolve;
    });
    let taken!: Promise<void>;
    // The other connection inserts the identity without the creation lock (as a rename would), after our checks ran.
    const findUser = second.store.findUser.bind(second.store);
    jest.spyOn(second.store, 'findUser').mockImplementation(async (lookup, withCredentials, context) => {
      const found = await findUser(lookup, withCredentials, context);
      if (lookup.username === 'carol' && !taken) {
        taken = first.store
          .insertUser({ ...aUser('carol'), email: 'other@example.com', isEmailVerified: false, locale: 'en' })
          .then(() => releaseTaker());
        await taker;
      }
      return found;
    });

    await expect(second.accounts.createOne(aUser('carol'))).rejects.toThrow(
      new BadRequestException('Username already exists'),
    );
    await taken;
  });

  it('tells which identity a unique constraint rejected', async () => {
    await first.store.insertUser({ ...aUser('dave'), isEmailVerified: false, locale: 'en' });

    await expect(
      first.store.insertUser({ ...aUser('dave'), email: 'new@example.com', isEmailVerified: false, locale: 'en' }),
    ).rejects.toEqual(new UserIdentityTakenError('username'));
    await expect(
      first.store.insertUsers([{ ...aUser('erin'), email: 'dave@example.com', isEmailVerified: false, locale: 'en' }]),
    ).rejects.toMatchObject({ field: 'email' });
  });
});
