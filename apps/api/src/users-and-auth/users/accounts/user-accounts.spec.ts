import { BadRequestException } from '@nestjs/common';
import { In } from 'typeorm';
import { User } from '@attraccess/database-entities';
import { UserAccounts } from './user-accounts';

describe('UserAccounts email normalisation', () => {
  const setup = () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
    };
    const em = { save: jest.fn(async (user: User) => ({ ...user, id: 5 })) };
    const dataSource = { transaction: jest.fn(async (work: (m: typeof em) => unknown) => work(em)) };
    const rbac = { assignDefaultRoles: jest.fn(), assignRoleByKey: jest.fn() };
    const metrics = {
      usersRegisteredTotal: { inc: jest.fn() },
      usersTotal: { inc: jest.fn() },
      usersPerLocale: { inc: jest.fn() },
    };
    const license = { verifyLicense: jest.fn() };
    const accounts = new UserAccounts(
      repository as never,
      license as never,
      dataSource as never,
      metrics as never,
      rbac as never,
    );
    return { accounts, repository, em };
  };

  it('looks users up by the normalised email', async () => {
    const { accounts, repository } = setup();
    const stored = { id: 1, email: 'alex@example.com' };
    repository.findOne.mockResolvedValueOnce(stored);
    await expect(accounts.findOne({ email: 'ALEX@Example.com' })).resolves.toBe(stored);
    expect(repository.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'alex@example.com' } }));
  });

  it('trims a padded email before validating the lookup', async () => {
    const { accounts, repository } = setup();
    await accounts.findOne({ email: '  Alex@Example.com ' });
    expect(repository.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'alex@example.com' } }));
  });

  it('matches emails case-insensitively when searching by emails or usernames', async () => {
    const { accounts, repository } = setup();
    const matches = [{ id: 1, email: 'alex@example.com' }];
    repository.find.mockResolvedValueOnce(matches);
    await expect(accounts.findByEmailsOrUsernames([' Alex@Example.com ', 'alex@example.com'], [])).resolves.toBe(
      matches,
    );
    expect(repository.find).toHaveBeenCalledWith({ where: [{ email: In(['alex@example.com']) }] });
  });

  it('stores the normalised email on creation', async () => {
    const { accounts, em } = setup();
    await accounts.createOne({ username: 'alex', email: '  Alex@Example.COM ', externalIdentifier: null });
    expect(em.save).toHaveBeenCalledWith(expect.objectContaining({ email: 'alex@example.com' }));
  });

  it('rejects a case-variant of an existing email', async () => {
    const { accounts, repository } = setup();
    repository.findOne.mockResolvedValueOnce({ id: 1, email: 'alex@example.com' });
    await expect(
      accounts.createOne({ username: 'alex2', email: 'ALEX@example.com', externalIdentifier: null }),
    ).rejects.toThrow(new BadRequestException('Email already exists'));
    expect(repository.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'alex@example.com' } }));
  });
});
