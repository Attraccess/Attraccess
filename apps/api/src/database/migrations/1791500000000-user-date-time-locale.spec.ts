import { DataSource } from 'typeorm';
import { UserDateTimePreferences1791400000000 } from './1791400000000-user-date-time-preferences';
import { UserDateTimeLocale1791500000000 } from './1791500000000-user-date-time-locale';

describe('UserDateTimeLocale migration', () => {
  it('upgrades the draft schema and rolls back while retaining users and translation locale', async () => {
    const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    const runner = database.createQueryRunner();
    try {
      await runner.query(`CREATE TABLE "user" (id integer PRIMARY KEY, locale varchar(35))`);
      await runner.query(`INSERT INTO "user" (id, locale) VALUES (1, 'de')`);
      const draft = new UserDateTimePreferences1791400000000();
      const migration = new UserDateTimeLocale1791500000000();
      await draft.up(runner);
      await migration.up(runner);
      expect(await runner.query(`SELECT * FROM "user"`)).toEqual([{ id: 1, locale: 'de', dateTimeLocale: null }]);
      await runner.query(`UPDATE "user" SET "dateTimeLocale" = 'en-GB'`);
      await migration.down(runner);
      expect(await runner.query(`SELECT * FROM "user"`)).toEqual([
        { id: 1, locale: 'de', dateFormat: 'language', timeFormat: '24-hour' },
      ]);
      await draft.down(runner);
      expect(await runner.query(`SELECT * FROM "user"`)).toEqual([{ id: 1, locale: 'de' }]);
    } finally {
      await runner.release();
      await database.destroy();
    }
  });
});
