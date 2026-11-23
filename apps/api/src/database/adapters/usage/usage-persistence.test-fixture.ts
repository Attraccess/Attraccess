import { EntityManagerResolver } from '../entity-manager-resolver';
import { unitOfWorkFor } from '../shared-unit-of-work';
import type { UnitOfWork } from '../../unit-of-work';
import type { UsageSessionStore } from '../../../resources/usage/usage-session-store.port';
import type { SessionDeadlineStore } from '../../../resources/usage/session-duration/session-deadline-store.port';
import { TypeOrmSessionDeadlineStore } from './typeorm-session-deadline.store';
import { TypeOrmUsageSessionStore } from './typeorm-usage-session.store';

/** What the usage collaborators need to run on a database: the unit of work, the handle resolver and the store. */
export interface UsagePersistence {
  unitOfWork: UnitOfWork;
  handles: EntityManagerResolver;
  store: UsageSessionStore;
  deadlines: SessionDeadlineStore;
}

const built = new WeakMap<object, UsagePersistence>();

/** The persistence the usage collaborators run on for real repositories (one per connection). */
export function usagePersistenceFor(repositories: { usage: unknown }): UsagePersistence {
  const usage = repositories.usage as { manager?: { connection?: Parameters<typeof unitOfWorkFor>[0] } };
  const existing = built.get(usage);
  if (existing) return existing;
  const connection = usage.manager?.connection;
  if (!connection) throw new Error('The usage persistence fixture needs a repository of a real connection');
  const unitOfWork = unitOfWorkFor(connection);
  const handles = new EntityManagerResolver(unitOfWork, connection);
  const created = {
    unitOfWork,
    handles,
    store: new TypeOrmUsageSessionStore(handles),
    deadlines: new TypeOrmSessionDeadlineStore(handles),
  };
  built.set(usage, created);
  return created;
}
