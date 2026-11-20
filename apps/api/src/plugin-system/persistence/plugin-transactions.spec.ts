import { PluginStorageConflict, PluginStorageInvalid } from '@attraccess/plugins-backend-sdk';
import { registerPersistenceErrorClassifier } from '../../database/persistence-errors';
import { sqliteBackend } from '../../database/sqlite/sqlite-backend';
import { handleOfScope } from './plugin-transaction-scope';
import { createPluginTransactions, type PluginTransactionsOptions } from './plugin-transactions';

const busy = () => Object.assign(new Error('SQLITE_BUSY: database is locked BEGIN IMMEDIATE'), { code: 'SQLITE_BUSY' });

function setup(overrides: Partial<PluginTransactionsOptions> = {}) {
  const onCallbackError = jest.fn();
  const handle = { engine: 'handle' };
  const transactions = createPluginTransactions({
    pluginName: 'demo',
    runInTransaction: (work) => work(handle),
    onCallbackError,
    ...overrides,
  });
  return { transactions, persistence: transactions.persistence, onCallbackError, handle };
}

describe('createPluginTransactions', () => {
  beforeAll(() => registerPersistenceErrorClassifier(sqliteBackend.errors));

  it('hands work an open scope on the engine handle and runs after-commit work in order after it', async () => {
    const { persistence, handle, transactions, onCallbackError } = setup();
    const order: string[] = [];
    const result = await persistence.transaction(async (scope) => {
      expect(handleOfScope(scope)).toBe(handle);
      expect(transactions.isRunning()).toBe(true);
      scope.afterCommit(() => void order.push('first'));
      scope.afterCommit(() => {
        throw new Error('mqtt down');
      });
      scope.afterCommit(() => void order.push('third'));
      return 42;
    });
    expect(result).toBe(42);
    expect(order).toEqual(['first', 'third']);
    expect(onCallbackError).toHaveBeenCalledWith(expect.objectContaining({ message: 'mqtt down' }));
    expect(transactions.isRunning()).toBe(false);
  });

  it('refuses a nested transaction with PluginStorageInvalid', async () => {
    const { persistence } = setup();
    await persistence.transaction(async () => {
      await expect(persistence.transaction(async () => undefined)).rejects.toBeInstanceOf(PluginStorageInvalid);
      await expect(persistence.transaction(async () => undefined)).rejects.toThrow(/inside a transaction callback/);
    });
  });

  it("refuses a transaction inside the host's own transaction before it starts one", async () => {
    const runInTransaction = jest.fn();
    const { persistence } = setup({ runInTransaction, insideHostTransaction: () => true });
    await expect(persistence.transaction(async () => undefined)).rejects.toBeInstanceOf(PluginStorageInvalid);
    await expect(persistence.transaction(async () => undefined)).rejects.toThrow(/host's own transaction/);
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it('passes what work threw through unchanged, also an engine error, and closes the scope', async () => {
    const { persistence } = setup();
    const own = new Error('overlap');
    let kept: Parameters<Parameters<typeof persistence.transaction>[0]>[0] | undefined;
    await expect(
      persistence.transaction(async (scope) => {
        kept = scope;
        throw own;
      }),
    ).rejects.toBe(own);
    const engine = busy();
    await expect(
      persistence.transaction(async () => {
        throw engine;
      }),
    ).rejects.toBe(engine);
    expect(kept?.isOpen).toBe(false);
    expect(() => kept?.afterCommit(() => undefined)).toThrow(PluginStorageInvalid);
  });

  it('maps a busy database at BEGIN or COMMIT to PluginStorageConflict without the engine text', async () => {
    const atBegin = setup({ runInTransaction: () => Promise.reject(busy()) });
    const error = await atBegin.persistence.transaction(async () => 1).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PluginStorageConflict);
    expect((error as Error).message).not.toMatch(/SQLITE|BEGIN/);

    const after = jest.fn();
    const atCommit = setup({
      runInTransaction: async (work) => {
        await work({});
        throw busy();
      },
    });
    await expect(
      atCommit.persistence.transaction(async (scope) => {
        scope.afterCommit(after);
      }),
    ).rejects.toBeInstanceOf(PluginStorageConflict);
    expect(after).not.toHaveBeenCalled();
  });
});
