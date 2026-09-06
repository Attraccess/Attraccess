import { DataSource } from 'typeorm';
import { AddWagoRejectionAcknowledgement1780010590000 } from './migrations/1780010590000-add-wago-rejection-acknowledgement';

it('preserves rejected revision history while adding and removing acknowledgement metadata', async () => {
  const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
  try {
    const runner = database.createQueryRunner();
    await runner.query('CREATE TABLE "plugin_wago_configuration_revisions" (id integer PRIMARY KEY, state text)');
    await runner.query('INSERT INTO "plugin_wago_configuration_revisions" VALUES (1, ?)', ['rejected']);
    const migration = new AddWagoRejectionAcknowledgement1780010590000();
    await migration.up(runner);
    expect(await runner.query('SELECT * FROM "plugin_wago_configuration_revisions"')).toEqual([
      { id: 1, state: 'rejected', rejection_acknowledged_at: null, rejection_acknowledged_by: null },
    ]);
    await migration.down(runner);
    expect(await runner.query('SELECT * FROM "plugin_wago_configuration_revisions"')).toEqual([
      { id: 1, state: 'rejected' },
    ]);
    await runner.release();
  } finally {
    await database.destroy();
  }
});
