import type { PersistenceErrorKind } from '../persistence-errors';
import type { UnitOfWork, TransactionScope } from '../unit-of-work';

/**
 * What the conformance suite needs from one connection to the database under test. A backend fixture implements this
 * with its own engine; the suite only knows the neutral contract. A second backend (ATT-584) adds a fixture, not a suite.
 */
export interface ConformanceConnection {
  readonly unitOfWork: UnitOfWork;
  /** Adds `delta` to the account balance with a read, then a write, inside the scope (a lost-update trap). */
  addToBalance(scope: TransactionScope, accountId: number, delta: number): Promise<void>;
  /** Inserts a row whose key must be unique. */
  insertUnique(scope: TransactionScope, key: string): Promise<void>;
  /** The committed balance, read outside any unit of work. */
  balance(accountId: number): Promise<number>;
  /** The engine's own interpretation of a failed statement. */
  classify(error: unknown): PersistenceErrorKind | undefined;
}

export interface ConnectOptions {
  /** How long a statement of this connection waits for another connection's lock before the engine gives up. */
  readonly lockTimeoutMs?: number;
}

export interface ConformanceDatabase {
  /** An independent connection to the same database: its own pool/handle, not a promise on a shared one. */
  connect(options?: ConnectOptions): Promise<ConformanceConnection>;
  /**
   * Holds the database's write lock from a further connection until the returned release is called, so writers of
   * other connections wait and, past their lock timeout, fail with the engine's busy error.
   */
  induceBusy(): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

export interface BackendFixture {
  /** Human readable backend name used in the test titles. */
  readonly name: string;
  /** A fresh, empty database with the conformance schema (accounts 1 and 2 at balance 0). */
  create(): Promise<ConformanceDatabase>;
}
