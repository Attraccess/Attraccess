import { MATTER_STORAGE } from '../plugin-storage/tables';
import { PLUGIN_TABLES, tableColumns } from './tables';

/**
 * The plugin tables a backup deliberately leaves out: the backups themselves, the recovery keys (never in a backup),
 * and the connection settings (an encrypted credential bound to this host).
 */
const NOT_BACKED_UP = ['plugin_matter_backups', 'plugin_matter_recovery_keys', 'plugin_matter_connection'];

describe('the tables a backup carries', () => {
  const backedUp = PLUGIN_TABLES.map(([name]) => name);

  it('covers every declared table, or excludes it on purpose', () => {
    const declared = Object.values(MATTER_STORAGE.tables).map((table) => table.physicalName as string);
    expect(declared).toHaveLength(Object.keys(MATTER_STORAGE.tables).length);
    expect([...declared].sort()).toEqual([...backedUp, ...NOT_BACKED_UP].sort());
  });

  it('names the columns of the 1.x layout, so a backup made before the port still restores', () => {
    const columns = tableColumns();
    expect([...(columns.get('plugin_matter_nodes') ?? [])]).toEqual(
      expect.arrayContaining(['fabric_ref', 'lifecycle_state', 'detached_reason', 'created_at']),
    );
    expect(columns.get('plugin_matter_commands')).toContain('request_id');
    expect(columns.get('plugin_matter_fabrics')).toContain('fabric_generation');
  });
});
