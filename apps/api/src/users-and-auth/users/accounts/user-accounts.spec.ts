import { BadRequestException } from '@nestjs/common';
import { FakeUnitOfWork, InMemoryUserStore } from '../fakes/in-memory-user-store.test-fixture';
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
    expect(spy).toHaveBeenCalledWith({ excludingUserId: 1 }, undefined);
  });
});
