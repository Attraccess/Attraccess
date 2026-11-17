import { runWithRetry } from '../unit-of-work';
import type { BackendFixture, ConformanceConnection, ConformanceDatabase } from './backend-fixture';

/**
 * The behavioural contract every backend must meet (ATT-1146 section 3). Each case uses independent connections, not
 * sequential promises on a shared one. ATT-584 runs this same suite against PostgreSQL by adding a fixture.
 */
export function describePersistenceConformance(fixture: BackendFixture): void {
  describe(`persistence conformance on ${fixture.name}`, () => {
    let database: ConformanceDatabase;
    let a: ConformanceConnection;
    let b: ConformanceConnection;

    beforeEach(async () => {
      database = await fixture.create();
      a = await database.connect();
      b = await database.connect();
    });

    afterEach(async () => {
      await database.close();
    });

    it('does not lose concurrent balance changes of the same account from independent connections', async () => {
      const work = (connection: ConformanceConnection) =>
        connection.unitOfWork.run((scope) => connection.addToBalance(scope, 1, 1));
      await Promise.all(Array.from({ length: 30 }, (_, index) => work(index % 2 === 0 ? a : b)));
      expect(await a.balance(1)).toBe(30);
    });

    it('keeps independent accounts correct while two connections write concurrently', async () => {
      await Promise.all([
        ...Array.from({ length: 10 }, () => a.unitOfWork.run((scope) => a.addToBalance(scope, 1, 2))),
        ...Array.from({ length: 10 }, () => b.unitOfWork.run((scope) => b.addToBalance(scope, 2, 3))),
      ]);
      expect([await a.balance(1), await a.balance(2)]).toEqual([20, 30]);
    });

    it('commits the writes of one unit together, or none of them', async () => {
      await expect(
        a.unitOfWork.run(async (scope) => {
          await a.addToBalance(scope, 1, 5);
          await a.addToBalance(scope, 2, 5);
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
      expect([await b.balance(1), await b.balance(2)]).toEqual([0, 0]);
      await a.unitOfWork.run(async (scope) => {
        await a.addToBalance(scope, 1, 5);
        await a.addToBalance(scope, 2, 5);
      });
      expect([await b.balance(1), await b.balance(2)]).toEqual([5, 5]);
    });

    it('runs post-commit work after the commit is visible to another connection, and never after a rollback', async () => {
      const seen: number[] = [];
      await a.unitOfWork.run(async (scope) => {
        await a.addToBalance(scope, 1, 7);
        scope.afterCommit(async () => void seen.push(await b.balance(1)));
      });
      expect(seen).toEqual([7]);

      const rolledBack = jest.fn();
      await expect(
        a.unitOfWork.run(async (scope) => {
          scope.afterCommit(rolledBack);
          await a.addToBalance(scope, 1, 1);
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
      expect(rolledBack).not.toHaveBeenCalled();
    });

    it('reports a duplicate key as a unique violation and leaves the transaction rolled back', async () => {
      await a.unitOfWork.run((scope) => a.insertUnique(scope, 'k'));
      const failure = await b.unitOfWork.run((scope) => b.insertUnique(scope, 'k')).catch((error: unknown) => error);
      expect(b.classify(failure)).toBe('unique-violation');
      await b.unitOfWork.run((scope) => b.insertUnique(scope, 'other'));
    });

    it('lets only one of two racing connections claim the same key', async () => {
      const results = await Promise.allSettled([
        a.unitOfWork.run((scope) => a.insertUnique(scope, 'race')),
        b.unitOfWork.run((scope) => b.insertUnique(scope, 'race')),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
      expect(a.classify(rejected.reason)).toBe('unique-violation');
    });

    /** The engine's real busy error: a write that waited past its lock timeout for another connection's lock. */
    async function busyErrorOf(): Promise<unknown> {
      const release = await database.induceBusy();
      try {
        const impatient = await database.connect({ lockTimeoutMs: 50 });
        return await impatient.unitOfWork
          .run((scope) => impatient.addToBalance(scope, 2, 1))
          .then(
            () => undefined,
            (error: unknown) => error,
          );
      } finally {
        await release();
      }
    }

    it("reports a write that waited out another connection's lock as busy", async () => {
      const error = await busyErrorOf();
      expect(error).toBeDefined();
      expect(a.classify(error)).toBe('busy');
      expect(await b.balance(2)).toBe(0);
    });

    it('retries a busy database with backoff until the lock is released and runs the effect once', async () => {
      const release = await database.induceBusy();
      const impatient = await database.connect({ lockTimeoutMs: 50 });
      const effect = jest.fn();
      const failures: unknown[] = [];
      await runWithRetry(
        impatient.unitOfWork,
        async (scope) => {
          scope.afterCommit(effect);
          await impatient.addToBalance(scope, 1, 1);
        },
        {
          attempts: 5,
          baseDelayMs: 10,
          isTransient: (error) => {
            failures.push(impatient.classify(error));
            // The lock holder finishes while the writer backs off.
            if (failures.length === 1) void release();
            return impatient.classify(error) === 'busy';
          },
        },
      );
      expect(failures[0]).toBe('busy');
      expect(effect).toHaveBeenCalledTimes(1);
      expect(await b.balance(1)).toBe(1);
    });

    it('never runs the effect of a failed attempt, and gives up after the attempt bound', async () => {
      const busy = await busyErrorOf();
      const effect = jest.fn();
      let attempts = 0;
      await expect(
        runWithRetry(
          a.unitOfWork,
          async (scope) => {
            attempts++;
            scope.afterCommit(effect);
            await a.addToBalance(scope, 1, 1);
            throw busy;
          },
          { attempts: 4, baseDelayMs: 1, isTransient: (error) => a.classify(error) === 'busy' },
        ),
      ).rejects.toBe(busy);
      expect(attempts).toBe(4);
      expect(effect).not.toHaveBeenCalled();
      expect(await b.balance(1)).toBe(0);
    });

    it('runs the effects of the committed attempt exactly once across retries', async () => {
      const busy = await busyErrorOf();
      const effects: number[] = [];
      let attempts = 0;
      await runWithRetry(
        a.unitOfWork,
        async (scope) => {
          const attempt = ++attempts;
          scope.afterCommit(() => void effects.push(attempt));
          await a.addToBalance(scope, 1, 1);
          if (attempt < 3) throw busy;
        },
        { baseDelayMs: 1, isTransient: (error) => a.classify(error) === 'busy' },
      );
      expect(effects).toEqual([3]);
      expect(await b.balance(1)).toBe(1);
    });

    it('does not retry a failure that is not transient', async () => {
      let attempts = 0;
      await expect(
        runWithRetry(a.unitOfWork, async () => {
          attempts++;
          throw new Error('logic error');
        }),
      ).rejects.toThrow('logic error');
      expect(attempts).toBe(1);
    });
  });
}
