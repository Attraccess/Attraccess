import { postgresMigrations } from './index';

describe('postgresMigrations', () => {
  const timestampOf = (migration: { name: string }) => Number(migration.name.match(/(\d{13})$/)?.[1]);

  it('is ordered by timestamp, because TypeORM runs migrations in timestamp order', () => {
    const stamps = postgresMigrations.map((migration) => timestampOf(new migration()));
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
  });

  it('dates the baseline in the past, so a migration generated today sorts after it', () => {
    const baseline = timestampOf(new postgresMigrations[0]());
    expect(baseline).toBeLessThan(Date.now());
  });
});
