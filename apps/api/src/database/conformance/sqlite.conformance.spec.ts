import { describePersistenceConformance } from './persistence.conformance.test-fixture';
import { sqliteFixture } from './sqlite.test-fixture';

describePersistenceConformance(sqliteFixture);
