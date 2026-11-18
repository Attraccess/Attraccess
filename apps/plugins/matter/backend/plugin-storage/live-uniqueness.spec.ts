// New installations do not get the 1.x partial unique indexes (`LEGACY_ONLY_CONSTRAINTS`): the plugin keeps "at most
// one live row" itself, by checking and writing in one serialized transaction. These specs race concurrent callers on
// one store and count the live rows; services on separate contexts stand for separate API instances.
import { randomUUID } from 'node:crypto';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { MatterConnectionService } from '../connection/connection.service';
import { DeviceAuditService } from '../devices/audit.service';
import { MatterReconciliationService } from '../devices/reconciliation.service';
import { recordFacts } from '../fabric/facts';
import { MatterFabricGuard } from '../fabric/guard';
import { RecoveryKeyService } from '../fabric/recovery-key.service';
import { createHarness, endpoint, inventory, node, type Harness } from '../testing/devices-harness.test-utils';
import { matterStorage } from './access';

const ADMIN_BY = { userId: 7, authenticationMethod: 'session' as const };

/** Another API instance on the same store: its own context, services and in-process guards. */
function instance(h: Harness) {
  const context = { ...h.context } as PluginContext;
  const audit = new DeviceAuditService(context);
  const connection = { connection: h.sidecar } as unknown as MatterConnectionService;
  return {
    context,
    reconciliation: new MatterReconciliationService(context, connection, audit, new MatterFabricGuard()),
    keys: new RecoveryKeyService(context, audit),
  };
}

/** How often each key occurs among the rows; every value must be 1. */
function occurrences<T>(rows: T[], key: (row: T) => string): number[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return [...counts.values()];
}

describe('Matter live-row uniqueness under concurrency', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.close());

  it('keeps one live fabric, node, endpoint and cluster when two instances reconcile the same inventory', async () => {
    h.sidecar.list = inventory('1', [node('5'), node('6', { endpoints: [endpoint(0, [0x0028]), endpoint(2)] })]);
    const [first, second] = [instance(h), instance(h)];

    await Promise.all([first.reconciliation.request(), second.reconciliation.request(), h.reconciliation.request()]);

    const { tables } = h;
    const fabrics = await tables.fabrics.find({ where: { retiredAt: null } });
    const nodes = await tables.nodes.find({ where: { removedAt: null } });
    const endpoints = await tables.endpoints.find({ where: { removedAt: null } });
    const clusters = await tables.endpointClusters.find({ where: { removedAt: null } });
    expect(fabrics.map((fabric) => fabric.fabricId)).toEqual(['1']);
    expect(nodes.map((row) => row.nodeId).sort()).toEqual(['5', '6']);
    expect(occurrences(nodes, (row) => `${row.fabricRef}/${row.nodeId}`)).toEqual([1, 1]);
    expect(endpoints).toHaveLength(4);
    expect(occurrences(endpoints, (row) => `${row.nodeRef}/${row.endpointId}`)).toEqual([1, 1, 1, 1]);
    // 0x0028 on both endpoints 0, 0x0006 + 0x0008 on node 5's endpoint 1, 0x0006 on node 6's endpoint 2.
    expect(clusters).toHaveLength(5);
    expect(occurrences(clusters, (row) => `${row.endpointRef}/${row.clusterId}/${row.role}`)).toEqual([1, 1, 1, 1, 1]);
  });

  it('records the facts of one fabric from concurrent transactions on a single live row', async () => {
    const facts = {
      fabricId: '77',
      fabricGeneration: 1,
      storageInstanceId: randomUUID(),
      rootCertFingerprint: 'a'.repeat(64),
    };
    const contexts = [h.context, instance(h).context, instance(h).context];

    await Promise.all(
      contexts.map((context) => matterStorage(context).transaction((tables) => recordFacts(tables, facts, 'Lab'))),
    );

    expect(await h.tables.fabrics.count({ fabricId: '77', retiredAt: null })).toBe(1);
  });

  it('creates at most one current recovery key when two instances generate at once', async () => {
    const [first, second] = [instance(h), instance(h)];

    const results = await Promise.allSettled([first.keys.generate(ADMIN_BY), second.keys.generate(ADMIN_BY)]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const [refused] = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(JSON.stringify((refused.reason as { getResponse?: () => unknown }).getResponse?.())).toContain(
      'recovery_key_exists',
    );
    expect(await h.tables.recoveryKeys.count({ retiredAt: null })).toBe(1);
    expect(await h.tables.recoveryKeys.count()).toBe(1);
  });

  it('leaves exactly one current recovery key when two instances rotate at once', async () => {
    const [first, second] = [instance(h), instance(h)];
    await first.keys.generate(ADMIN_BY);

    const results = await Promise.allSettled([first.keys.rotate(ADMIN_BY), second.keys.rotate(ADMIN_BY)]);

    // The second rotation runs after the first committed and rotates the key that one created.
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(await h.tables.recoveryKeys.count({ retiredAt: null })).toBe(1);
    expect(await h.tables.recoveryKeys.count()).toBe(3);
  });
});
