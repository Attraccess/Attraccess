import { ScopedUnitOfWork, TransactionDriver, TransactionScopeError } from './unit-of-work';

/** A fake engine: records commit/rollback and hands out a numbered handle. */
function fakeDriver() {
  const log: string[] = [];
  let next = 0;
  const driver: TransactionDriver<{ id: number }> = {
    async transaction(work) {
      const handle = { id: ++next };
      log.push(`begin ${handle.id}`);
      try {
        const result = await work(handle);
        log.push(`commit ${handle.id}`);
        return result;
      } catch (error) {
        log.push(`rollback ${handle.id}`);
        throw error;
      }
    },
  };
  return { driver, log };
}

describe('ScopedUnitOfWork (engine independent contract)', () => {
  it('runs post-commit callbacks after the commit, in registration order', async () => {
    const { driver, log } = fakeDriver();
    const uow = new ScopedUnitOfWork(driver);
    const result = await uow.run(async (scope) => {
      scope.afterCommit(() => void log.push('mail'));
      scope.afterCommit(async () => void log.push('publish'));
      log.push('work');
      return 42;
    });
    expect(result).toBe(42);
    expect(log).toEqual(['begin 1', 'work', 'commit 1', 'mail', 'publish']);
  });

  it('never runs post-commit callbacks on rollback', async () => {
    const { driver, log } = fakeDriver();
    const uow = new ScopedUnitOfWork(driver);
    await expect(
      uow.run(async (scope) => {
        scope.afterCommit(() => void log.push('mail'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(log).toEqual(['begin 1', 'rollback 1']);
  });

  it('keeps the commit and the other callbacks when a post-commit callback fails', async () => {
    const { driver, log } = fakeDriver();
    const uow = new ScopedUnitOfWork(driver);
    await uow.run(async (scope) => {
      scope.afterCommit(() => {
        throw new Error('smtp down');
      });
      scope.afterCommit(() => void log.push('second'));
    });
    expect(log).toEqual(['begin 1', 'commit 1', 'second']);
  });

  it('reuses the parent scope for nested use instead of opening a second transaction', async () => {
    const { driver, log } = fakeDriver();
    const uow = new ScopedUnitOfWork(driver);
    await uow.run(async (outer) => {
      await uow.run(async (inner) => {
        expect(inner).toBe(outer);
        expect(uow.current()).toBe(outer);
        inner.afterCommit(() => void log.push('nested callback'));
      });
      log.push('outer end');
    });
    expect(log).toEqual(['begin 1', 'outer end', 'commit 1', 'nested callback']);
  });

  it('opens a separate transaction for a flow that does not belong to the running unit', async () => {
    const { driver, log } = fakeDriver();
    const uow = new ScopedUnitOfWork(driver);
    expect(uow.current()).toBeUndefined();
    await uow.run(async () => undefined);
    await uow.run(async () => undefined);
    expect(log).toEqual(['begin 1', 'commit 1', 'begin 2', 'commit 2']);
  });

  it('rejects a closed scope and a scope of another unit of work', async () => {
    const { driver } = fakeDriver();
    const uow = new ScopedUnitOfWork(driver);
    const other = new ScopedUnitOfWork(fakeDriver().driver);
    let leaked!: Parameters<Parameters<typeof uow.run>[0]>[0];
    await uow.run(async (scope) => {
      leaked = scope;
      expect(uow.handleOf(scope)).toEqual({ id: 1 });
      expect(() => other.handleOf(scope)).toThrow(TransactionScopeError);
    });
    expect(leaked.isOpen).toBe(false);
    expect(() => uow.handleOf(leaked)).toThrow('closed');
    expect(() => leaked.afterCommit(() => undefined)).toThrow(TransactionScopeError);
  });

  it('closes the scope when the work fails', async () => {
    const { driver } = fakeDriver();
    const uow = new ScopedUnitOfWork(driver);
    let leaked!: Parameters<Parameters<typeof uow.run>[0]>[0];
    await expect(
      uow.run(async (scope) => {
        leaked = scope;
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    expect(leaked.isOpen).toBe(false);
  });
});
