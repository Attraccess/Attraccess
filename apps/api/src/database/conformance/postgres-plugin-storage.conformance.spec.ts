import { describePluginStorageContract } from './plugin-storage/plugin-storage-contract.conformance.test-fixture';
import { describePluginStorageRecords } from './plugin-storage/plugin-storage-records.conformance.test-fixture';
import { describePluginStorageLifecycle } from './plugin-storage/plugin-storage-lifecycle.conformance.test-fixture';
import { describePluginStorageTransactions } from './plugin-storage/plugin-storage-transactions.conformance.test-fixture';
import { postgresStorageFixture, removePostgresTemplate } from './plugin-storage/postgres-plugin-storage.test-fixture';

jest.setTimeout(120_000);

afterAll(removePostgresTemplate);

describePluginStorageContract(postgresStorageFixture);
describePluginStorageRecords(postgresStorageFixture);
describePluginStorageTransactions(postgresStorageFixture);
describePluginStorageLifecycle(postgresStorageFixture);
