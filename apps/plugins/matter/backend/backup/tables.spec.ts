import { getMetadataArgsStorage } from 'typeorm';
import plugin from '../plugin';
import { createHarness } from '../testing/devices-harness.test-utils';
import { PLUGIN_TABLES } from './tables';

/**
 * The plugin tables a backup deliberately leaves out: the backups themselves, the recovery keys (never in a backup),
 * and the connection settings (an encrypted credential bound to this host).
 */
const NOT_BACKED_UP = ['plugin_matter_backups', 'plugin_matter_recovery_keys', 'plugin_matter_connection'];

describe('the tables a backup carries', () => {
  const backedUp = PLUGIN_TABLES.map(([name]) => name);

  it('covers every table of every entity the plugin registers, or excludes it on purpose', () => {
    const registered = getMetadataArgsStorage()
      .tables.filter((table) => (plugin.entities ?? []).includes(table.target as never))
      .map((table) => table.name as string);
    expect(registered).toHaveLength(plugin.entities?.length ?? -1);
    expect([...registered].sort()).toEqual([...backedUp, ...NOT_BACKED_UP].sort());
  });

  it('covers every plugin_matter_* table the migrations create', async () => {
    const h = await createHarness();
    try {
      const created = (
        (await h.dataSource.query(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'plugin_matter_%'`,
        )) as { name: string }[]
      ).map((row) => row.name);
      expect(created.sort()).toEqual([...backedUp, ...NOT_BACKED_UP].sort());
    } finally {
      await h.close();
    }
  });
});
