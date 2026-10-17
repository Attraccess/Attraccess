import { DataSource } from 'typeorm';
import { UserDateTimePreferences1791400000000 } from './1791400000000-user-date-time-preferences';

describe('UserDateTimePreferences migration', () => {
  it('preserves users and locale, supplies compatible defaults, and can be reverted', async () => {
    const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    const runner = database.createQueryRunner();
    try {
      await runner.query(`CREATE TABLE "user" (id integer PRIMARY KEY, locale varchar(35))`);
      await runner.query(`INSERT INTO "user" (id, locale) VALUES (1, 'de')`);
      const migration = new UserDateTimePreferences1791400000000();
      await migration.up(runner);
      expect(await runner.query(`SELECT * FROM "user"`)).toEqual([
        { id: 1, locale: 'de', dateFormat: 'language', timeFormat: '24-hour' },
      ]);
      await migration.down(runner);
      expect(await runner.query(`SELECT * FROM "user"`)).toEqual([{ id: 1, locale: 'de' }]);
    } finally {
      await runner.release();
      await database.destroy();
    }
  });
});
