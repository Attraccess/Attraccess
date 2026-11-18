import { postgresTransferFixture } from './postgres-transfer.test-fixture';
import { describeTransferConformance } from './transfer.conformance.test-fixture';

jest.setTimeout(120_000);

describeTransferConformance(postgresTransferFixture);
