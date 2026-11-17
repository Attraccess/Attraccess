import { retryDelayMs, runWithRetry, ScopedUnitOfWork, TransactionDriver, TransactionScopeError } from './unit-of-work';

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

describe('runWithRetry', () => {
  const transient = Object.assign(new Error('busy'), { transient: true });
  const isTransient = (error: unknown) => (error as { transient?: boolean }).transient === true;

  it('waits a jittered, exponentially growing and capped delay between attempts', async () => {
    const { driver } = fakeDriver();
    const waits: number[] = [];
    let attempts = 0;
    await expect(
      runWithRetry(
        new ScopedUnitOfWork(driver),
        async () => {
          attempts++;
          throw transient;
        },
        {
          attempts: 5,
          isTransient,
          baseDelayMs: 40,
          maxDelayMs: 100,
          random: () => 0.5,
          sleep: async (ms) => void waits.push(ms),
        },
      ),
    ).rejects.toBe(transient);
    expect(attempts).toBe(5);
    // Bounds 40, 80, 100 (capped), 100; half of each with the fixed random number. No wait after the last attempt.
    expect(waits).toEqual([20, 40, 50, 50]);
  });

  it('keeps every delay below its bound and never negative', () => {
    expect(retryDelayMs(1, { random: () => 0 })).toBe(0);
    expect(retryDelayMs(1, { random: () => 0.999 })).toBeLessThan(50);
    expect(retryDelayMs(30, { random: () => 0.999 })).toBeLessThan(1000);
  });

  it('never runs more than ten attempts', async () => {
    const { driver } = fakeDriver();
    let attempts = 0;
    const work = async () => {
      attempts++;
      throw transient;
    };
    await expect(
      runWithRetry(new ScopedUnitOfWork(driver), work, { attempts: 1000, isTransient, sleep: async () => undefined }),
    ).rejects.toBe(transient);
    expect(attempts).toBe(10);
  });

  it('refuses to run inside an open unit of work, where a retry would join the failed transaction', async () => {
    const { driver, log } = fakeDriver();
    const uow = new ScopedUnitOfWork(driver);
    const inner = jest.fn();
    await uow.run(async (scope) => {
      scope.afterCommit(() => void log.push('outer effect'));
      await expect(runWithRetry(uow, inner)).rejects.toThrow(TransactionScopeError);
    });
    expect(inner).not.toHaveBeenCalled();
    expect(log).toEqual(['begin 1', 'commit 1', 'outer effect']);
  });

  it('runs the post-commit work of the committed attempt only', async () => {
    const { driver } = fakeDriver();
    const effects: number[] = [];
    let attempts = 0;
    await runWithRetry(
      new ScopedUnitOfWork(driver),
      async (scope) => {
        const attempt = ++attempts;
        scope.afterCommit(() => void effects.push(attempt));
        if (attempt < 3) throw transient;
      },
      { isTransient, sleep: async () => undefined },
    );
    expect(effects).toEqual([3]);
  });
});
