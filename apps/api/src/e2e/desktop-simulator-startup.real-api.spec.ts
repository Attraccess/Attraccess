import { DataSource } from 'typeorm';
import { existsSync } from 'fs';
import { bootstrap } from '../main.bootstrap';
import { disposeStorage, storageRoot } from '../test/desktop-real-api.test-fixture';

it('closes the real API database and removes owned storage after migration startup failure', async () => {
  let database: DataSource | undefined;
  let started: Awaited<ReturnType<typeof bootstrap>> | undefined;
  const migrate = jest.spyOn(DataSource.prototype, 'showMigrations').mockImplementationOnce(async function (
    this: DataSource,
  ) {
    database = this; // eslint-disable-line @typescript-eslint/no-this-alias -- retain the real failed connection to verify closure
    throw new Error('Injected API migration failure');
  });
  try {
    await expect(
      bootstrap().then((result) => {
        started = result;
        return result;
      }),
    ).rejects.toThrow('Injected API migration failure');
    expect(database).toBeDefined();
    expect(database?.isInitialized).toBe(false);
  } finally {
    migrate.mockRestore();
    await started?.app.close();
    if (database?.isInitialized) await database.destroy();
    disposeStorage();
  }
  expect(existsSync(storageRoot)).toBe(false);
}, 60_000);
