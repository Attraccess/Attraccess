import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { closeResourceTransactionConnection, runSerializedTransaction } from './transactions';

it('drains initially queued writes, rejects new submissions during shutdown and closes the dedicated connection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sqlite-shutdown-'));
  const source = await new DataSource({ type: 'sqlite', database: join(directory, 'db.sqlite') }).initialize();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const events: string[] = [];
  let dedicated: DataSource | undefined;
  try {
    const first = runSerializedTransaction(source.manager, async (manager) => {
      dedicated = manager.connection;
      events.push('entered');
      await gate;
      await manager.query('CREATE TABLE accepted_write (id INTEGER)');
      events.push('committed');
    });
    const second = runSerializedTransaction(source.manager, async (manager) => {
      await manager.query('INSERT INTO accepted_write VALUES (1)');
      events.push('second');
    });
    const closing = closeResourceTransactionConnection(source).then(() => {
      events.push('closed');
    });
    await expect(runSerializedTransaction(source.manager, async () => undefined)).rejects.toThrow('closing');
    release();
    await Promise.all([first, second, closing]);
    expect(events).toEqual(['entered', 'committed', 'second', 'closed']);
    expect(dedicated?.isInitialized).toBe(false);
    expect(await source.query('SELECT * FROM accepted_write')).toEqual([{ id: 1 }]);
    await expect(runSerializedTransaction(source.manager, async () => undefined)).rejects.toThrow('closing');
  } finally {
    release();
    await closeResourceTransactionConnection(source);
    await source.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});
