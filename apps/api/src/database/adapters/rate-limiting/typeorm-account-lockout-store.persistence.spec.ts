import { DataSource } from 'typeorm';
import { User } from '@attraccess/database-entities';
import { PostgresDatabaseFixture } from '../postgres-database.test-fixture';
import { TypeOrmAccountLockoutStore } from './typeorm-account-lockout-store';

jest.setTimeout(60_000);

describe('TypeOrmAccountLockoutStore on real PostgreSQL', () => {
  let fixture: PostgresDatabaseFixture;
  let first: DataSource;
  let store: TypeOrmAccountLockoutStore;
  let makerId: number;
  const stored = () => first.getRepository(User).findOneByOrFail({ id: makerId });

  beforeAll(async () => {
    fixture = await PostgresDatabaseFixture.create();
    first = await fixture.open();
    store = new TypeOrmAccountLockoutStore((await fixture.open()).getRepository(User));
  });

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(async () => {
    await first.getRepository(User).createQueryBuilder().delete().execute();
    makerId = (await first.getRepository(User).save({ username: 'maker', email: 'maker@example.com' })).id;
  });

  it('records the failure streak, then locks and resets the streak', async () => {
    const firstFailedAt = new Date(Date.now() - 5000);
    await store.recordFailureStreak(makerId, { failedAttempts: 2, firstFailedAt });
    expect(await stored()).toMatchObject({
      failedLoginAttempts: 2,
      firstFailedLoginAt: firstFailedAt,
      lockedUntil: null,
    });

    const lockedUntil = new Date(Date.now() + 60_000);
    await store.lockAccount(makerId, lockedUntil);
    expect(await stored()).toMatchObject({ failedLoginAttempts: 0, firstFailedLoginAt: null, lockedUntil });
  });

  it('clears the lock and the streak', async () => {
    await store.lockAccount(makerId, new Date(Date.now() + 60_000));
    await store.clearLockout(makerId);
    expect(await stored()).toMatchObject({ failedLoginAttempts: 0, firstFailedLoginAt: null, lockedUntil: null });
  });
});
