import type { DataSource, EntityManager } from 'typeorm';
import { ScopedUnitOfWork, TransactionScopeError } from '../unit-of-work';
import { EntityManagerResolver } from './entity-manager-resolver';

const transactionManager = { name: 'transaction' } as unknown as EntityManager;
const applicationManager = { name: 'application' } as unknown as EntityManager;

function setup() {
  const uow = new ScopedUnitOfWork<EntityManager>({ transaction: (work) => work(transactionManager) });
  const resolver = new EntityManagerResolver(uow, { manager: applicationManager } as DataSource);
  return { uow, resolver };
}

describe('EntityManagerResolver', () => {
  it('joins the unit of work that is open in the current async flow', async () => {
    const { uow, resolver } = setup();

    await expect(uow.run(async () => resolver.resolve())).resolves.toBe(transactionManager);
  });

  it('reads through the application connection outside of any unit of work', () => {
    const { resolver } = setup();

    expect(resolver.resolve()).toBe(applicationManager);
  });

  it('does not join a closed scope that a post-commit continuation still sees as current', async () => {
    const { uow, resolver } = setup();
    let release!: () => void;
    const committed = new Promise<void>((resolve) => (release = resolve));
    let continuation!: Promise<EntityManager>;

    await uow.run(async (scope) => {
      // Registered inside the unit of work, so the continuation inherits its async context.
      continuation = committed.then(() => {
        expect(uow.current()).toBe(scope);
        expect(scope.isOpen).toBe(false);
        return resolver.resolve();
      });
    });
    release();

    await expect(continuation).resolves.toBe(applicationManager);
  });

  it('still rejects an explicitly passed scope that is closed', async () => {
    const { uow, resolver } = setup();
    const scope = await uow.run(async (open) => open);

    expect(() => resolver.resolve(scope)).toThrow(TransactionScopeError);
  });
});
