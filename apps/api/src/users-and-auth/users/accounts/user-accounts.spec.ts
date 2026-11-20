import { BadRequestException } from '@nestjs/common';
import { FakeUnitOfWork, InMemoryUserStore } from '../fakes/in-memory-user-store.test-fixture';
import { UserIdentityTakenError } from '../user-store.port';
import { UserAccounts } from './user-accounts';

describe('UserAccounts email normalisation', () => {
  const setup = () => {
    const store = new InMemoryUserStore();
    store.seed({ id: 1, username: 'alex', email: 'alex@example.com' });
    const uow = new FakeUnitOfWork();
    const rbac = { assignDefaultRoles: jest.fn(), assignRoleByKey: jest.fn() };
    const metrics = {
      usersRegisteredTotal: { inc: jest.fn() },
      usersTotal: { inc: jest.fn() },
      usersPerLocale: { inc: jest.fn() },
    };
    const license = { verifyLicense: jest.fn() };
    const accounts = new UserAccounts(store, license as never, uow, metrics as never, rbac as never);
    return { accounts, store };
  };

  it('looks users up by the normalised email', async () => {
    const { accounts, store } = setup();
    const spy = jest.spyOn(store, 'findUser');
    await expect(accounts.findOne({ email: 'ALEX@Example.com' })).resolves.toMatchObject({ id: 1 });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ email: 'alex@example.com' }), false, undefined);
  });

  it('trims a padded email before validating the lookup', async () => {
    const { accounts } = setup();
    await expect(accounts.findOne({ email: '  Alex@Example.com ' })).resolves.toMatchObject({ id: 1 });
  });

  it('matches emails case-insensitively when searching by emails or usernames', async () => {
    const { accounts, store } = setup();
    const spy = jest.spyOn(store, 'findByEmailsOrUsernames');
    await expect(
      accounts.findByEmailsOrUsernames([' Alex@Example.com ', 'alex@example.com'], [' ALEX ']),
    ).resolves.toHaveLength(1);
    expect(spy).toHaveBeenCalledWith(['alex@example.com'], ['alex']);
  });

  it('stores the normalised email on creation', async () => {
    const { accounts, store } = setup();
    await accounts.createOne({ username: 'alex2', email: '  Alex2@Example.COM ', externalIdentifier: null });
    expect(store.users.map((user) => user.email)).toContain('alex2@example.com');
  });

  it('rejects a case-variant of an existing email', async () => {
    const { accounts } = setup();
    await expect(
      accounts.createOne({ username: 'alex2', email: 'ALEX@example.com', externalIdentifier: null }),
    ).rejects.toThrow(new BadRequestException('Email already exists'));
  });

  it('excludes the replaced first-time-setup account from the license usage count', async () => {
    const { accounts, store } = setup();
    const spy = jest.spyOn(store, 'countUsers');
    await accounts.createOne({ username: 'alex2', email: 'alex2@example.com', externalIdentifier: null }, undefined, {
      excludedUserIdFromLicenseUsage: 1,
    });
    expect(spy).toHaveBeenCalledWith({ excludingUserId: 1 }, expect.anything());
  });
});

describe('UserAccounts account creation', () => {
  const setup = () => {
    const store = new InMemoryUserStore();
    const uow = new FakeUnitOfWork();
    const rbac = { assignDefaultRoles: jest.fn(), assignRoleByKey: jest.fn() };
    const metrics = {
      usersRegisteredTotal: { inc: jest.fn() },
      usersTotal: { inc: jest.fn() },
      usersPerLocale: { inc: jest.fn() },
    };
    const accounts = new UserAccounts(
      store,
      { verifyLicense: jest.fn() } as never,
      uow,
      metrics as never,
      rbac as never,
    );
    return { accounts, store, uow, rbac };
  };
  const newUser = { username: 'alex', email: 'alex@example.com', externalIdentifier: null };

  it('takes the account creation lock in the transaction before counting or checking identities', async () => {
    const { accounts, store, uow } = setup();
    const order: string[] = [];
    jest.spyOn(store, 'lockAccountCreation').mockImplementation(async (context) => {
      expect(context).toBe(uow.scopes[0]);
      order.push('lock');
    });
    const count = jest.spyOn(store, 'countUsers');
    count.mockImplementation(async () => {
      order.push('count');
      return 0;
    });
    jest.spyOn(store, 'findUser').mockImplementation(async () => {
      order.push('find');
      return null;
    });

    await accounts.createOne(newUser);

    expect(order[0]).toBe('lock');
    expect(order.slice(1)).not.toContain('lock');
    expect(order).toContain('count');
  });

  it('answers 400 like the existence check when a concurrent write took the email first', async () => {
    const { accounts, store, uow } = setup();
    jest.spyOn(store, 'insertUser').mockRejectedValue(new UserIdentityTakenError('email'));

    await expect(accounts.createOne(newUser)).rejects.toThrow(new BadRequestException('Email already exists'));
    expect(uow.events).toEqual(['begin', 'rollback']);
  });

  it('answers 400 like the existence check when a concurrent write took the username first', async () => {
    const { accounts, store } = setup();
    jest.spyOn(store, 'insertUser').mockRejectedValue(new UserIdentityTakenError('username'));

    await expect(accounts.createOne(newUser)).rejects.toThrow(new BadRequestException('Username already exists'));
  });

  it('claims the first-time-setup account under the account creation lock in its own transaction', async () => {
    const { accounts, store, uow } = setup();
    store.seed({ id: 1, username: 'setup', email: 'setup@example.com', isEmailVerified: false });
    const lock = jest.spyOn(store, 'lockAccountCreation');

    await expect(accounts.releaseFirstTimeSetupAdminIdentifiers()).resolves.toMatchObject({ id: 1 });

    expect(lock).toHaveBeenCalledWith(uow.scopes[0]);
    expect(store.users[0].username).toMatch(/^first-time-setup-1-/);
  });
});
