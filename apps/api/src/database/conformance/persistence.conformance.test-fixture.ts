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

    it('retries a transient failure a bounded number of times and runs the external effect once', async () => {
      const effect = jest.fn();
      let attempts = 0;
      await runWithRetry(
        a.unitOfWork,
        async (scope) => {
          attempts++;
          await a.addToBalance(scope, 1, 1);
          scope.afterCommit(effect);
          if (attempts < 3) throw Object.assign(new Error('transient'), { code: 'SQLITE_BUSY' });
        },
        { isTransient: (error) => (error as { code?: string }).code === 'SQLITE_BUSY' },
      );
      expect(attempts).toBe(3);
      expect(effect).toHaveBeenCalledTimes(1);
      expect(await b.balance(1)).toBe(1);
    });

    it('gives up after the attempt bound and never runs the effect of a failed attempt', async () => {
      const effect = jest.fn();
      let attempts = 0;
      await expect(
        runWithRetry(
          a.unitOfWork,
          async (scope) => {
            attempts++;
            scope.afterCommit(effect);
            throw Object.assign(new Error('transient'), { code: 'SQLITE_BUSY' });
          },
          { attempts: 4, isTransient: () => true },
        ),
      ).rejects.toThrow('transient');
      expect(attempts).toBe(4);
      expect(effect).not.toHaveBeenCalled();
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
