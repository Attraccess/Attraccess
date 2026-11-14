import { BadRequestException } from '@nestjs/common';
import { User } from '@attraccess/database-entities';
import { UserAccounts } from './user-accounts';
import { normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
  it('trims and lowercases, including non-ASCII letters', () => {
    expect(normalizeEmail('  Alex@Example.COM ')).toBe('alex@example.com');
    expect(normalizeEmail('Ünal@Example.com')).toBe('ünal@example.com');
  });
});

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
    await accounts.findOne({ email: 'ALEX@Example.com' });
    expect(repository.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'alex@example.com' } }));
  });

  it('matches emails case-insensitively when searching by emails or usernames', async () => {
    const { accounts, repository } = setup();
    await accounts.findByEmailsOrUsernames([' Alex@Example.com ', 'alex@example.com'], []);
    const [{ where }] = repository.find.mock.calls[0];
    expect(where[0].email._value).toEqual(['alex@example.com']);
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
