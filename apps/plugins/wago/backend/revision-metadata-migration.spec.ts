import { DataSource } from 'typeorm';
import { AddWagoRevisionEditorMetadata1780010580000 } from './migrations/1780010580000-add-wago-revision-editor-metadata';

it('adds nullable revision metadata without changing existing history and can roll back', async () => {
  const database = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
  try {
    const runner = database.createQueryRunner();
    await runner.query('CREATE TABLE "plugin_wago_configuration_revisions" (id integer PRIMARY KEY, snapshot text)');
    await runner.query('INSERT INTO "plugin_wago_configuration_revisions" VALUES (1, ?)', ['original-snapshot']);
    const migration = new AddWagoRevisionEditorMetadata1780010580000();
    await migration.up(runner);
    expect(await runner.query('SELECT * FROM "plugin_wago_configuration_revisions"')).toEqual([
      { id: 1, snapshot: 'original-snapshot', preset_provenance: null },
    ]);
    await migration.down(runner);
    expect(await runner.query('SELECT * FROM "plugin_wago_configuration_revisions"')).toEqual([
      { id: 1, snapshot: 'original-snapshot' },
    ]);
    await runner.release();
  } finally {
    await database.destroy();
  }
});
