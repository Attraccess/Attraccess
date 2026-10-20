import { DataSource } from 'typeorm';
import { NestFactory } from '@nestjs/core';
import { existsSync } from 'fs';
import { bootstrap } from '../main.bootstrap';
import { withDesktopCleanup } from './desktop-simulator-cleanup';
import { disposeStorage, storageRoot } from '../test/desktop-real-api.test-fixture';

it('releases the real database and storage when migration startup and application closure both fail', async () => {
  let database: DataSource | undefined;
  let started: Awaited<ReturnType<typeof bootstrap>> | undefined;
  const create = NestFactory.create.bind(NestFactory);
  const applications: Awaited<ReturnType<typeof NestFactory.create>>[] = [];
  const factory = jest.spyOn(NestFactory, 'create').mockImplementation(async (...args) => {
    const app = await create(...args);
    applications.push(app);
    if (applications.length === 2) {
      return new Proxy(app, {
        get(target, property) {
          if (property === 'close')
            return async () => {
              throw new Error('Injected application cleanup failure');
            };
          return Reflect.get(target, property);
        },
      });
    }
    return app;
  });
  const migrate = jest.spyOn(DataSource.prototype, 'showMigrations').mockImplementationOnce(async function (
    this: DataSource,
  ) {
    database = this; // eslint-disable-line @typescript-eslint/no-this-alias -- retain the real failed connection to verify closure
    throw new Error('Injected API migration failure');
  });
  await withDesktopCleanup(
    async () => {
      await expect(
        bootstrap().then((result) => {
          started = result;
          return result;
        }),
      ).rejects.toThrow('Injected API migration failure');
      expect(database).toBeDefined();
      expect(database?.isInitialized).toBe(false);
    },
    () => migrate.mockRestore(),
    () => factory.mockRestore(),
    async () => {
      for (const app of applications) await app.close();
    },
    async () => started?.app.close(),
    async () => {
      if (database?.isInitialized) await database.destroy();
    },
    disposeStorage,
  );

  expect(existsSync(storageRoot)).toBe(false);
}, 60_000);
