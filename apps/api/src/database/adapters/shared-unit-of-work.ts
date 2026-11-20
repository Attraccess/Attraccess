import type { DataSource, EntityManager } from 'typeorm';
import { resolveDatabaseBackend } from '../backend';
import type { ScopedUnitOfWork } from '../unit-of-work';

const unitsOfWork = new WeakMap<DataSource, ScopedUnitOfWork<EntityManager>>();

/**
 * The one unit of work of a connection, built by the selected backend. Scopes only work with the unit of work that
 * opened them, so adapters that take part in the same transaction must share it. The application gets it from
 * `PersistenceCoreModule`; tests that wire adapters by hand get it here.
 */
export function unitOfWorkFor(source: DataSource): ScopedUnitOfWork<EntityManager> {
  let unitOfWork = unitsOfWork.get(source);
  if (!unitOfWork) {
    unitOfWork = resolveDatabaseBackend().createUnitOfWork(source);
    unitsOfWork.set(source, unitOfWork);
  }
  return unitOfWork;
}
