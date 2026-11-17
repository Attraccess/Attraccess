import { removeSqlitePortTemplate } from './ports/sqlite-port.test-fixture';
import { describePluginStorageRecords } from './plugin-storage/plugin-storage-records.conformance.test-fixture';
import { describePluginStorageLifecycle } from './plugin-storage/plugin-storage-lifecycle.conformance.test-fixture';
import { describePluginStorageTransactions } from './plugin-storage/plugin-storage-transactions.conformance.test-fixture';
import { sqliteStorageFixture } from './plugin-storage/sqlite-plugin-storage.test-fixture';

jest.setTimeout(120_000);

afterAll(removeSqlitePortTemplate);

describePluginStorageRecords(sqliteStorageFixture);
describePluginStorageTransactions(sqliteStorageFixture);
describePluginStorageLifecycle(sqliteStorageFixture);
