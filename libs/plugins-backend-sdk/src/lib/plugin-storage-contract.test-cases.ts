import {
  contractStorage,
  type OpenSide,
  type StorageContractBackend,
  type StorageContractFactory,
} from './plugin-storage-contract-fixture.test-cases';
import { describeStorageContractQueries } from './plugin-storage-contract-queries.test-cases';
import { describeStorageContractTransactions } from './plugin-storage-contract-transactions.test-cases';
import { describeStorageContractValues } from './plugin-storage-contract-values.test-cases';
import { describeStorageContractWrites } from './plugin-storage-contract-writes.test-cases';

export * from './plugin-storage-contract-fixture.test-cases';

/**
 * The behaviour contract of plugin storage (`context.storage` and `context.persistence.transaction`), independent of
 * the backend. The SDK runs it against `createInMemoryPluginStorage`; the API runs the very same cases against each
 * database adapter on real connections (api:test-conformance), so the fake and the host cannot drift apart. Cases that
 * need a real engine (independent connections racing, a busy database, raw SQL) stay with the host's suite.
 *
 * This file is test code: it is excluded from the SDK build and not reachable through the package exports.
 */

/** What differs between engines in how writes wait for each other. */
export interface StorageContractOptions {
  /**
   * Whether a write without scope waits behind an open transaction of the same process (the
   * in-memory fake). False for an engine whose transactions run concurrently (PostgreSQL): the write is a transaction of
   * its own and does not wait unless it touches rows the open transaction holds.
   */
  readonly queuesWrites?: boolean;
}

/** Defines the whole contract suite for one backend. */
export function definePluginStorageContractSuite(
  name: string,
  create: StorageContractFactory,
  options: StorageContractOptions = {},
): void {
  describe(`plugin storage contract (${name})`, () => {
    let backend: StorageContractBackend;
    beforeAll(async () => {
      backend = await create(contractStorage);
    });
    afterAll(() => backend?.close());
    const open: OpenSide = () => backend.open();

    describeStorageContractValues(open);
    describeStorageContractQueries(open);
    describeStorageContractWrites(open);
    describeStorageContractTransactions(open, options.queuesWrites ?? true);
  });
}
