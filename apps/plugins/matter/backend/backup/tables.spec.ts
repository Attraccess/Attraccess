import { MATTER_STORAGE } from '../plugin-storage/tables';
import { createHarness, nodeRow } from '../testing/devices-harness.test-utils';
import { PLUGIN_TABLES, readTables, replaceTables, tableColumns } from './tables';

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

describe('restoring nodes across the version 3 columns', () => {
  it('restores a row from before version 3 (no administrators columns) with null, and a new one as it is', async () => {
    const h = await createHarness();
    await h.tables.nodes.insert(
      nodeRow({ id: 'new', nodeId: '7', administrators: '[{"fabricIndex":1}]', attestationOverridden: true }),
    );
    const written = await readTables(h.tables);
    expect(written['plugin_matter_nodes'][0]).toMatchObject({ attestation_overridden: true });
    const old = { ...written['plugin_matter_nodes'][0], id: 'old', node_id: '8' };
    delete (old as Record<string, unknown>)['administrators'];
    delete (old as Record<string, unknown>)['attestation_overridden'];
    await replaceTables(h.tables, { ...written, plugin_matter_nodes: [written['plugin_matter_nodes'][0], old] });
    expect(await h.tables.nodes.get('old')).toMatchObject({ administrators: null, attestationOverridden: null });
    expect(await h.tables.nodes.get('new')).toMatchObject({ attestationOverridden: true });
  });

  it('accepts the new removal reasons', async () => {
    const h = await createHarness();
    await h.tables.nodes.insert(
      nodeRow({ id: 'gone', lifecycleState: 'removed', removalReason: 'forced_from_fabric', removedAt: 't' }),
    );
    const written = await readTables(h.tables);
    await expect(replaceTables(h.tables, written)).resolves.toBeUndefined();
  });
});
