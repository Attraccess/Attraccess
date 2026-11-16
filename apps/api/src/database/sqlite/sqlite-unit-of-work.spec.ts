import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { closeResourceTransactionConnection } from './run-serialized-transaction';
import { createSqliteUnitOfWork } from './sqlite-unit-of-work';

describe('createSqliteUnitOfWork on a real file database', () => {
  let directory: string;
  let source: DataSource;
  let uow: ReturnType<typeof createSqliteUnitOfWork>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'uow-'));
    source = await new DataSource({ type: 'sqlite', database: join(directory, 'test.sqlite') }).initialize();
    await source.query('CREATE TABLE account (id INTEGER PRIMARY KEY, balance INTEGER NOT NULL)');
    await source.query('INSERT INTO account VALUES (1, 0), (2, 0)');
    uow = createSqliteUnitOfWork(source);
  });

  afterEach(async () => {
    await closeResourceTransactionConnection(source);
    await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  const balance = async (id: number) => (await source.query('SELECT balance FROM account WHERE id = ?', [id]))[0].balance;

  it('commits all writes of a unit together and runs the post-commit effect once, after the commit', async () => {
    const seen: number[] = [];
    await uow.run(async (scope) => {
      const manager = uow.handleOf(scope);
      await manager.query('UPDATE account SET balance = balance + 5 WHERE id = 1');
      await manager.query('UPDATE account SET balance = balance + 7 WHERE id = 2');
      scope.afterCommit(async () => void seen.push(await balance(1)));
    });
    expect(seen).toEqual([5]);
    expect([await balance(1), await balance(2)]).toEqual([5, 7]);
  });

  it('rolls everything back and skips the post-commit effect when the unit fails', async () => {
    const effect = jest.fn();
    await expect(
      uow.run(async (scope) => {
        await uow.handleOf(scope).query('UPDATE account SET balance = 99 WHERE id = 1');
        scope.afterCommit(effect);
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    expect(await balance(1)).toBe(0);
    expect(effect).not.toHaveBeenCalled();
  });

  it('does not lose concurrent increments of the same account (read-modify-write races)', async () => {
    await Promise.all(
      Array.from({ length: 25 }, () =>
        uow.run(async (scope) => {
          const manager = uow.handleOf(scope);
          const [{ balance: current }] = await manager.query('SELECT balance FROM account WHERE id = 1');
          await manager.query('UPDATE account SET balance = ? WHERE id = 1', [current + 1]);
        }),
      ),
    );
    expect(await balance(1)).toBe(25);
  });

  it('keeps writes of independent accounts correct under concurrency', async () => {
    await Promise.all(
      [1, 2].flatMap((id) =>
        Array.from({ length: 10 }, () =>
          uow.run(async (scope) => {
            await uow.handleOf(scope).query('UPDATE account SET balance = balance + 1 WHERE id = ?', [id]);
          }),
        ),
      ),
    );
    expect([await balance(1), await balance(2)]).toEqual([10, 10]);
  });
});
