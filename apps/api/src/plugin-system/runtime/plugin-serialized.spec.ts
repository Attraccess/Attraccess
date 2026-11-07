import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { closeResourceTransactionConnection } from '../../database/run-serialized-transaction';
import { createPluginRunSerialized } from './plugin-serialized';

describe('plugin runSerialized', () => {
  let directory: string;
  let source: DataSource;
  let runSerialized: ReturnType<typeof createPluginRunSerialized>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'plugin-serialized-'));
    source = await new DataSource({ type: 'sqlite', database: join(directory, 'test.sqlite') }).initialize();
    await source.query('CREATE TABLE counter (value INTEGER NOT NULL)');
    await source.query('INSERT INTO counter VALUES (0)');
    runSerialized = createPluginRunSerialized('booking', () => source.manager);
  });

  afterEach(async () => {
    await closeResourceTransactionConnection(source);
    await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  const readCounter = async () => (await source.query('SELECT value FROM counter'))[0].value;

  it('commits the callback work and returns its result', async () => {
    await expect(
      runSerialized(async (manager) => {
        await manager.query('UPDATE counter SET value = value + 1');
        return 'done';
      }),
    ).resolves.toBe('done');
    expect(await readCounter()).toBe(1);
  });

  it('rejects a nested call instead of deadlocking on the shared queue, and rolls the outer work back', async () => {
    const outer = runSerialized(async (manager) => {
      await manager.query('UPDATE counter SET value = value + 1');
      await runSerialized(async () => undefined);
    });
    await expect(outer).rejects.toThrow(/booking.*inside a runSerialized callback/);
    expect(await readCounter()).toBe(0);
  });

  it('runs calls that start after the callback settled', async () => {
    let later: Promise<void> | undefined;
    await runSerialized(async () => {
      later = new Promise<void>((resolve) => setTimeout(resolve, 0)).then(() =>
        runSerialized(async (manager) => {
          await manager.query('UPDATE counter SET value = value + 1');
        }),
      );
    });
    await later;
    expect(await readCounter()).toBe(1);
  });

  it('runs concurrent top-level calls one after another', async () => {
    await Promise.all(
      [1, 2, 3].map(() =>
        runSerialized(async (manager) => {
          const [{ value }] = await manager.query('SELECT value FROM counter');
          await new Promise((resolve) => setTimeout(resolve, 5));
          await manager.query('UPDATE counter SET value = ?', [value + 1]);
        }),
      ),
    );
    expect(await readCounter()).toBe(3);
  });
});
