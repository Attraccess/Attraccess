import { AttractapReaderIdentity } from '@attraccess/database-entities';
import { registerMigrationsDownUpWithDataE2eFixture } from './fixtures/round-trip.test-fixture';
describe('Migrations down/up with data (e2e)', () => {
  const fixture = registerMigrationsDownUpWithDataE2eFixture(false);

  it('reverts before enrollment, then preserves enrolled history by refusing rollback', async () => {
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
    const repository = fixture.dataSource.getRepository(AttractapReaderIdentity);
    const history = await repository.find();
    expect(history.length).toBeGreaterThan(0);
    const migrationCount = await fixture.getMigrationCount(fixture.dataSource);
    await expect(fixture.dataSource.undoLastMigration()).rejects.toThrow(/Cannot roll back/);
    expect(await fixture.getMigrationCount(fixture.dataSource)).toBe(migrationCount);
    expect(await fixture.dataSource.runMigrations()).toEqual([]);
    expect(await repository.find()).toEqual(history);
    await expect(repository.delete(history[0].id)).rejects.toThrow(/cannot be deleted/);
    await fixture.assertForeignKeysClean(fixture.dataSource, 'refused rollback');
  });
});
