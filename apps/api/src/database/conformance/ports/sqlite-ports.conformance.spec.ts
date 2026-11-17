import { describeBillingLedgerConformance } from './billing-ledger.conformance.test-fixture';
import { describePasskeyStoreConformance } from './passkey-store.conformance.test-fixture';
import { describeSessionStoreConformance } from './session-store.conformance.test-fixture';
import { describeSumUpCredentialConformance } from './sumup-credential.conformance.test-fixture';
import { removeSqlitePortTemplate, sqlitePortFixture } from './sqlite-port.test-fixture';

jest.setTimeout(60_000);

afterAll(removeSqlitePortTemplate);

describeBillingLedgerConformance(sqlitePortFixture);
describeSessionStoreConformance(sqlitePortFixture);
describePasskeyStoreConformance(sqlitePortFixture);
describeSumUpCredentialConformance(sqlitePortFixture);
