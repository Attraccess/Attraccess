import { registerMigrationsDownUpWithDataE2eFixture } from './fixtures/round-trip.test-fixture';
describe('Migrations down/up with data (e2e)', () => {
  const fixture = registerMigrationsDownUpWithDataE2eFixture();

  it('reverts each migration and reapplies them', async () => {
    await fixture.dataSource.query('PRAGMA foreign_keys = ON');
    let remaining = await fixture.getMigrationCount(fixture.dataSource);

    while (remaining > 0) {
      const migrationName = await fixture.getLastMigrationName(fixture.dataSource);
      try {
        await fixture.dataSource.undoLastMigration();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to undo migration ${migrationName ?? 'unknown'}: ${message}`);
      }
      remaining = await fixture.getMigrationCount(fixture.dataSource);
    }

    await fixture.dataSource.runMigrations();
    await fixture.seedDatabase(fixture.dataSource);
    await fixture.assertAllEntitiesHaveRows(fixture.dataSource);
    await fixture.assertForeignKeysClean(fixture.dataSource, 'reapplied migrations');
  });
});
