import { runWithRetry } from '../unit-of-work';
import { describePersistenceConformance } from './persistence.conformance.test-fixture';
import { postgresFixture } from './postgres.test-fixture';
import type { ConformanceConnection, ConformanceDatabase } from './backend-fixture';

jest.setTimeout(60_000);

describePersistenceConformance(postgresFixture);

describe('persistence conformance: PostgreSQL deadlocks (40P01)', () => {
  let database: ConformanceDatabase;
  let a: ConformanceConnection;
  let b: ConformanceConnection;

  beforeEach(async () => {
    database = await postgresFixture.create();
    a = await database.connect();
    b = await database.connect();
  });
  afterEach(() => database.close());

  /** Two units lock the accounts in opposite order: PostgreSQL aborts one of them with a deadlock. */
  const crossLock = async (first: ConformanceConnection, second: ConformanceConnection) => {
    let reached = 0;
    const barrier = async () => {
      reached++;
      while (reached < 2) await new Promise((resolve) => setTimeout(resolve, 5));
    };
    return Promise.allSettled([
      first.unitOfWork.run(async (scope) => {
        await first.addToBalance(scope, 1, 1);
        await barrier();
        await first.addToBalance(scope, 2, 1);
      }),
      second.unitOfWork.run(async (scope) => {
        await second.addToBalance(scope, 2, 1);
        await barrier();
        await second.addToBalance(scope, 1, 1);
      }),
    ]);
  };

  it('aborts one of two crossing writers with a conflict the unit of work reports', async () => {
    const results = await crossLock(a, b);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(a.classify(rejected[0].reason)).toBe('conflict');
    // The survivor committed both of its writes, the victim none.
    expect([await a.balance(1), await a.balance(2)]).toEqual([1, 1]);
  });

  it('retries the deadlock victim and runs the effect of the committed attempt once', async () => {
    const effects: number[] = [];
    let attempts = 0;
    let reached = 0;
    const barrier = async () => {
      reached++;
      while (reached < 2) await new Promise((resolve) => setTimeout(resolve, 5));
    };
    const retried = runWithRetry(
      a.unitOfWork,
      async (scope) => {
        const attempt = ++attempts;
        scope.afterCommit(() => void effects.push(attempt));
        await a.addToBalance(scope, 1, 1);
        if (attempt === 1) await barrier();
        await a.addToBalance(scope, 2, 1);
      },
      { baseDelayMs: 1, attempts: 5 },
    );
    const rival = b.unitOfWork.run(async (scope) => {
      await b.addToBalance(scope, 2, 10);
      await barrier();
      await b.addToBalance(scope, 1, 10);
    });
    const [mine, theirs] = await Promise.allSettled([retried, rival]);
    // PostgreSQL picks the victim. Mine is retried and commits (effect of the last attempt only); if the rival is the
    // victim, mine committed at once. Either way exactly one effect ran, for the attempt that committed.
    expect(mine.status).toBe('fulfilled');
    if (theirs.status === 'rejected') expect(a.classify(theirs.reason)).toBe('conflict');
    expect(effects).toEqual([attempts]);
    const rivalApplied = theirs.status === 'fulfilled' ? 10 : 0;
    expect([await a.balance(1), await a.balance(2)]).toEqual([1 + rivalApplied, 1 + rivalApplied]);
  });
});
