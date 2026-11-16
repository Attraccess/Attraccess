import { Resource, ResourceUsage, User } from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManagerResolver } from '../../../../database/adapters/entity-manager-resolver';
import { TypeOrmUsageSessionStore } from '../../../../database/adapters/usage/typeorm-usage-session.store';
import { unitOfWorkFor } from '../../../../database/adapters/shared-unit-of-work';
import { TransactionScope, UNIT_OF_WORK, UnitOfWork } from '../../../../database/unit-of-work';
import { USAGE_SESSION_STORE, UsageSessionStore } from '../../usage-session-store.port';

interface RepositoryLike {
  manager?: {
    transaction?: (work: (manager: unknown) => Promise<unknown>) => Promise<unknown>;
    count?: (...args: unknown[]) => unknown;
    connection?: { options?: { type?: string } };
  };
  findOne?: (options: unknown) => unknown;
}

/** What the usage collaborators need to run on a database: the unit of work, the handle resolver and the store. */
export interface UsagePersistence {
  unitOfWork: UnitOfWork;
  handles: EntityManagerResolver;
  store: UsageSessionStore;
}

/**
 * Unit specs that fake the ORM: transactions are the mock repository's `manager.transaction`, reads outside a
 * transaction go to the mock repositories, as they did before the persistence code moved into the adapter. The real
 * adapter runs on top of these fakes, so the statements it issues stay visible to the specs.
 */
function fakedOrmPersistence(repositories: {
  resource: RepositoryLike;
  usage: RepositoryLike;
  user?: RepositoryLike;
}): { unitOfWork: UnitOfWork; handles: EntityManagerResolver } {
  const transactions = new WeakMap<object, unknown>();
  const reads = {
    // `manager.count` of the resource repository counts the running sessions of a machine.
    count: (...args: unknown[]) => repositories.resource.manager?.count?.(...args),
    findOne: (entity: unknown, options: unknown) =>
      entity === Resource
        ? repositories.resource.findOne?.(options)
        : entity === ResourceUsage
          ? repositories.usage.findOne?.(options)
          : undefined,
    getRepository: (entity: unknown) =>
      entity === Resource ? repositories.resource : entity === User ? repositories.user : repositories.usage,
  };
  const unitOfWork: UnitOfWork = {
    run: (work) =>
      (repositories.usage.manager?.transaction?.(async (manager) => {
        const scope: TransactionScope = { isOpen: true, afterCommit: () => undefined };
        transactions.set(scope, manager);
        return work(scope);
      }) ?? Promise.reject(new Error('The mock repository has no transaction'))) as never,
    current: () => undefined,
  };
  const resolve = (context?: object) => (context ? (transactions.get(context) ?? context) : reads);
  const handles = { resolve, legacyHandle: resolve } as unknown as EntityManagerResolver;
  return { unitOfWork, handles };
}

const built = new WeakMap<object, UsagePersistence>();

/** The persistence the usage collaborators run on, for real SQLite repositories or for mocked ones. */
export function usagePersistenceFor(repositories: {
  resource: unknown;
  usage: unknown;
  user?: unknown;
}): UsagePersistence {
  const usage = repositories.usage as RepositoryLike;
  const existing = built.get(usage);
  if (existing) return existing;
  const created = createPersistence(repositories, usage);
  built.set(usage, created);
  return created;
}

function createPersistence(
  repositories: { resource: unknown; usage: unknown; user?: unknown },
  usage: RepositoryLike,
): UsagePersistence {
  const connection = usage.manager?.connection as
    (Parameters<typeof unitOfWorkFor>[0] & { options: { type?: string } }) | undefined;
  if (connection?.options?.type === 'sqlite') {
    const unitOfWork = unitOfWorkFor(connection);
    const handles = new EntityManagerResolver(unitOfWork, connection);
    return { unitOfWork, handles, store: new TypeOrmUsageSessionStore(handles) };
  }
  const { unitOfWork, handles } = fakedOrmPersistence({
    resource: repositories.resource as RepositoryLike,
    usage,
    user: repositories.user as RepositoryLike | undefined,
  });
  return { unitOfWork, handles, store: new TypeOrmUsageSessionStore(handles) };
}

/** Providers of the persistence ports for specs that fake the ORM (see persistence.test-fixture). */
export function fakedOrmPersistenceProviders() {
  const tokens = [getRepositoryToken(Resource), getRepositoryToken(ResourceUsage), getRepositoryToken(User)];
  const persistence = (resource: unknown, usage: unknown, user: unknown) =>
    usagePersistenceFor({ resource, usage, user });
  return [
    {
      provide: UNIT_OF_WORK,
      inject: tokens,
      useFactory: (...r: unknown[]) => persistence(r[0], r[1], r[2]).unitOfWork,
    },
    {
      provide: EntityManagerResolver,
      inject: tokens,
      useFactory: (...r: unknown[]) => persistence(r[0], r[1], r[2]).handles,
    },
    {
      provide: USAGE_SESSION_STORE,
      inject: tokens,
      useFactory: (...r: unknown[]) => persistence(r[0], r[1], r[2]).store,
    },
  ];
}
