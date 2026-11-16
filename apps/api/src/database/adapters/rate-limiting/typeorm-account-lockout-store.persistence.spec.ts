import { DataSource } from 'typeorm';
import { User } from '@attraccess/database-entities';
import { isDatabaseBusyError } from '../../persistence-errors';
import { SqliteFileFixture } from '../sqlite-file.test-fixture';
import { TypeOrmAccountLockoutStore } from './typeorm-account-lockout-store';

jest.setTimeout(60_000);

describe('TypeOrmAccountLockoutStore on real SQLite', () => {
  let fixture: SqliteFileFixture;
  let first: DataSource;
  let store: TypeOrmAccountLockoutStore;
  const stored = () => first.getRepository(User).findOneByOrFail({ id: 7 });

  beforeAll(async () => {
    fixture = await SqliteFileFixture.create();
    first = await fixture.open();
    store = new TypeOrmAccountLockoutStore((await fixture.open()).getRepository(User));
  });

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(async () => {
    await first.getRepository(User).clear();
    await first.getRepository(User).save({ id: 7, username: 'maker', email: 'maker@example.com' });
  });

  it('records the failure streak, then locks and resets the streak', async () => {
    const firstFailedAt = new Date(Date.now() - 5000);
    await store.recordFailureStreak(7, { failedAttempts: 2, firstFailedAt });
    expect(await stored()).toMatchObject({
      failedLoginAttempts: 2,
      firstFailedLoginAt: firstFailedAt,
      lockedUntil: null,
    });

    const lockedUntil = new Date(Date.now() + 60_000);
    await store.lockAccount(7, lockedUntil);
    expect(await stored()).toMatchObject({ failedLoginAttempts: 0, firstFailedLoginAt: null, lockedUntil });
  });

  it('clears the lock and the streak', async () => {
    await store.lockAccount(7, new Date(Date.now() + 60_000));
    await store.clearLockout(7);
    expect(await stored()).toMatchObject({ failedLoginAttempts: 0, firstFailedLoginAt: null, lockedUntil: null });
  });

  it('reports a busy database with the neutral busy category, so it is not counted as a failed login', async () => {
    const impatient = new TypeOrmAccountLockoutStore((await fixture.open(false, 100)).getRepository(User));
    const writer = first.createQueryRunner();
    await writer.connect();
    await writer.startTransaction();
    await writer.query('UPDATE user SET locale = locale WHERE id = 7');
    let failure: unknown;
    try {
      await impatient.lockAccount(7, new Date(Date.now() + 60_000)).catch((error) => {
        failure = error;
      });
    } finally {
      await writer.rollbackTransaction();
      await writer.release();
    }

    expect(isDatabaseBusyError(failure)).toBe(true);
    expect((await stored()).lockedUntil).toBeNull();
  });
});
