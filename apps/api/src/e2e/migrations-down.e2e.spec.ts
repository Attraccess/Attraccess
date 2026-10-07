import { registerMigrationsDownUpWithDataE2eFixture } from './migrations-down.e2e.migrations-down-up-with-data-e2e.test-fixture';
import { registerRevertsEachMigrationAndReappliesThemCases } from './migrations-down.e2e.migrations-down-up-with-data-e2e.reverts-each-migration-and-reapplies-them.test-cases';
describe('Migrations down/up with data (e2e)', () => {
  const fixture = registerMigrationsDownUpWithDataE2eFixture();
  registerRevertsEachMigrationAndReappliesThemCases(fixture);
});
