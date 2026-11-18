import { User } from '@attraccess/database-entities';
import type { Repository } from 'typeorm';
import { TypeOrmSessionUserDirectory } from './typeorm-session-user-directory';

describe('TypeOrmSessionUserDirectory', () => {
  it('maps the account row to a plain session user instead of handing out the entity', async () => {
    const row = Object.assign(new User(), {
      id: 7,
      username: 'ada',
      email: 'ada@example.com',
      locale: 'en',
      failedLoginAttempts: 0,
      creditBalance: 0,
      billingFactor: 100,
      authenticationDetails: [{ id: 1 }],
    });
    const users = { findOne: jest.fn().mockResolvedValue(row) } as unknown as Repository<User>;

    const user = await new TypeOrmSessionUserDirectory(users).findSessionUser(7);

    expect(user).not.toBeInstanceOf(User);
    expect(user).toMatchObject({ id: 7, username: 'ada', email: 'ada@example.com' });
    expect(user).not.toHaveProperty('authenticationDetails');
  });

  it('returns null for an unknown account', async () => {
    const users = { findOne: jest.fn().mockResolvedValue(null) } as unknown as Repository<User>;
    await expect(new TypeOrmSessionUserDirectory(users).findSessionUser(7)).resolves.toBeNull();
  });
});
