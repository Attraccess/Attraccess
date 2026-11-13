import { MatterEndpoint, MatterEndpointCluster, MatterFabric, MatterNode } from './entities';
import {
  ADMIN,
  createHarness,
  endpoint,
  inventory,
  node,
  timeoutError,
  unsupportedCapability,
  type Harness,
} from '../testing/devices-harness.test-utils';
import { SidecarUnavailableError } from '../client/errors';

const nodes = (h: Harness) => h.dataSource.getRepository(MatterNode);
const live = (h: Harness, nodeId: string, fabricId = '1') =>
  h.dataSource
    .getRepository(MatterNode)
    .createQueryBuilder('n')
    .innerJoin(MatterFabric, 'f', 'f.id = n.fabricRef')
    .where('n.nodeId = :nodeId AND f.fabricId = :fabricId AND n.removedAt IS NULL', { nodeId, fabricId })
    .getOneOrFail();
const snapshot = async (h: Harness) => ({
  fabrics: await h.rows('plugin_matter_fabrics'),
  nodes: await h.rows('plugin_matter_nodes'),
  endpoints: await h.rows('plugin_matter_endpoints'),
  clusters: await h.rows('plugin_matter_endpoint_clusters'),
  capabilities: await h.rows('plugin_matter_endpoint_capabilities'),
});

describe('Matter reconciliation', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.close());

  describe('with an authoritative inventory', () => {
    it('quarantines sidecar-only nodes as unclaimed with endpoints, clusters and capabilities', async () => {
      const status = await h.reconcile(inventory('1', [node('5')]));
      expect(status.lastResult).toBe('applied');
      expect(status.sidecarFabricId).toBe('1');
      expect(status.lastSummary?.changes.nodesQuarantined).toBe(1);
      const stored = await live(h, '5');
      expect(stored).toMatchObject({
        lifecycleState: 'unclaimed',
        claimedAt: null,
        vendorName: 'Acme',
        reachable: true,
      });
      const endpoints = await h.dataSource.getRepository(MatterEndpoint).find({ order: { endpointId: 'ASC' } });
      expect(endpoints.map((e) => [e.endpointId, e.profile])).toEqual([
        [0, 'generic'],
        [1, 'dimmable_actuator'],
      ]);
      const capabilities = await h.rows<{ capability: string }>('plugin_matter_endpoint_capabilities');
      expect(capabilities.map((c) => c.capability).sort()).toEqual(['levelControl', 'onOff']);
      expect(h.actions()).toEqual(['matter.node_quarantined']);
    });

    it('never claims a node automatically', async () => {
      await h.reconcile(inventory('1', [node('5')]));
      await h.reconcile(inventory('1', [node('5'), node('6')]));
      expect((await nodes(h).find()).every((n) => n.lifecycleState === 'unclaimed')).toBe(true);
    });

    it('is idempotent: a second run on the same response changes no row and writes no audit entry', async () => {
      const list = inventory('1', [node('5'), node('6', { endpoints: [endpoint(1, [0x0045])] })]);
      await h.reconcile(list);
      const before = await snapshot(h);
      const auditBefore = h.audit.mock.calls.length;
      const status = await h.reconcile(list);
      expect(status.lastSummary?.changeCount).toBe(0);
      expect(await snapshot(h)).toEqual(before);
      expect(h.audit.mock.calls.length).toBe(auditBefore);
    });

    it('detaches claimed and unclaimed records the sidecar no longer lists, and deletes nothing', async () => {
      await h.reconcile(inventory('1', [node('5'), node('6')]));
      const claimed = await live(h, '6');
      await h.lifecycle.claim(claimed.id, {}, ADMIN);
      h.audit.mockClear();
      const status = await h.reconcile(inventory('1', []));
      expect(status.lastSummary?.changes.nodesDetached).toBe(2);
      const all = await nodes(h).find();
      expect(all).toHaveLength(2);
      expect(all.every((n) => n.lifecycleState === 'detached' && n.detachedReason === 'absent_from_sidecar')).toBe(
        true,
      );
      expect(h.actions()).toEqual(['matter.node_detached', 'matter.node_detached']);
      expect(await h.dataSource.getRepository(MatterEndpoint).count()).toBe(4);
      // Detached stays detached on the next run.
      expect((await h.reconcile(inventory('1', []))).lastSummary?.changeCount).toBe(0);
    });

    it('re-attaches a detached record whose exact identity reappears, back to its former state', async () => {
      await h.reconcile(inventory('1', [node('5'), node('6')]));
      await h.lifecycle.claim((await live(h, '6')).id, { displayName: 'Lamp' }, ADMIN);
      await h.reconcile(inventory('1', []));
      h.audit.mockClear();
      const status = await h.reconcile(inventory('1', [node('5'), node('6')]));
      expect(status.lastSummary?.changes).toMatchObject({ nodesReattached: 2, nodesQuarantined: 0 });
      expect(await live(h, '6')).toMatchObject({
        lifecycleState: 'claimed',
        displayName: 'Lamp',
        detachedReason: null,
      });
      expect(await live(h, '5')).toMatchObject({ lifecycleState: 'unclaimed' });
      expect(h.actions()).toEqual(['matter.node_reattached', 'matter.node_reattached']);
    });

    it('never changes an archived record and only reports that it reappeared', async () => {
      await h.reconcile(inventory('1', [node('5')]));
      await h.reconcile(inventory('1', []));
      await h.lifecycle.archive((await live(h, '5')).id, ADMIN);
      h.audit.mockClear();
      const status = await h.reconcile(inventory('1', [node('5')]));
      expect(status.lastSummary?.observed.archivedReappeared).toBe(1);
      expect(status.lastSummary?.changeCount).toBe(0);
      expect((await live(h, '5')).lifecycleState).toBe('archived');
      expect(await nodes(h).count()).toBe(1);
      expect(h.audit).not.toHaveBeenCalled();
    });

    it('refreshes protocol identity but never overwrites editable metadata', async () => {
      await h.reconcile(inventory('1', [node('5')]));
      const stored = await live(h, '5');
      await h.lifecycle.claim(stored.id, { displayName: 'Mine' }, ADMIN);
      await h.lifecycle.updateNode(stored.id, { description: 'Hall', location: 'Lab' }, ADMIN);
      const endpointRow = await h.dataSource.getRepository(MatterEndpoint).findOneByOrFail({ endpointId: 1 });
      await h.lifecycle.updateEndpoint(endpointRow.id, { displayName: 'Socket' }, ADMIN);
      const status = await h.reconcile(
        inventory('1', [
          node('5', { vendorName: 'Other', softwareVersion: 4, softwareVersionString: '1.0.4', reachable: false }),
        ]),
      );
      expect(status.lastSummary?.changes.nodesUpdated).toBe(1);
      expect(await live(h, '5')).toMatchObject({
        vendorName: 'Other',
        softwareVersion: 4,
        reachable: false,
        displayName: 'Mine',
        description: 'Hall',
        location: 'Lab',
      });
      expect(
        (await h.dataSource.getRepository(MatterEndpoint).findOneByOrFail({ id: endpointRow.id })).displayName,
      ).toBe('Socket');
    });

    it('treats an equal node ID on another fabric as a different node', async () => {
      await h.reconcile(inventory('1', [node('5')]));
      await h.reconcile(inventory('2', [node('5')]));
      expect(await nodes(h).count()).toBe(2);
      expect((await live(h, '5', '1')).id).not.toBe((await live(h, '5', '2')).id);
    });
  });

  describe('endpoints and clusters', () => {
    it('marks vanished endpoints and clusters removed instead of deleting them, and recreates them later', async () => {
      await h.reconcile(inventory('1', [node('5')]));
      await h.reconcile(inventory('1', [node('5', { endpoints: [endpoint(0, [0x0028]), endpoint(1, [0x0006])] })]));
      let clusters = await h.dataSource.getRepository(MatterEndpointCluster).find();
      expect(clusters.filter((c) => c.removedAt !== null).map((c) => c.clusterId)).toEqual([0x0008]);
      await h.reconcile(inventory('1', [node('5', { endpoints: [endpoint(0, [0x0028])] })]));
      const endpoints = await h.dataSource.getRepository(MatterEndpoint).find({ order: { endpointId: 'ASC' } });
      expect(endpoints.map((e) => [e.endpointId, e.removedAt !== null, e.removalReason])).toEqual([
        [0, false, null],
        [1, true, 'absent_from_sidecar'],
      ]);
      await h.reconcile(inventory('1', [node('5')]));
      expect(await h.dataSource.getRepository(MatterEndpoint).count()).toBe(3);
      clusters = await h.dataSource.getRepository(MatterEndpointCluster).find();
      expect(clusters.length).toBeGreaterThan(3);
    });

    it('retires a bridged endpoint whose unique ID changed and creates a new one', async () => {
      const bridged = (uniqueId: string) =>
        endpoint(3, [0x0006, 0x0039], {
          bridged: {
            uniqueId,
            nodeLabel: 'Bulb',
            vendorName: null,
            productName: null,
            serialNumber: null,
            reachable: true,
          },
        });
      await h.reconcile(inventory('1', [node('5', { endpoints: [bridged('A')] })]));
      const first = await h.dataSource.getRepository(MatterEndpoint).findOneByOrFail({ endpointId: 3 });
      await h.lifecycle.updateEndpoint(first.id, { displayName: 'Bulb A' }, ADMIN);
      const status = await h.reconcile(inventory('1', [node('5', { endpoints: [bridged('B')] })]));
      expect(status.lastSummary?.changes.endpointsReplaced).toBe(1);
      const rows = await h.dataSource.getRepository(MatterEndpoint).find({ order: { firstSeenAt: 'ASC', id: 'ASC' } });
      const old = rows.find((row) => row.id === first.id);
      const fresh = rows.find((row) => row.id !== first.id);
      expect(old).toMatchObject({ removalReason: 'replaced', bridgedUniqueId: 'A', displayName: 'Bulb A' });
      expect(fresh).toMatchObject({ removedAt: null, bridgedUniqueId: 'B', displayName: null, bridged: true });
    });
  });

  describe('without an authoritative inventory', () => {
    const seed = async () => {
      await h.reconcile(inventory('1', [node('5')]));
      return snapshot(h);
    };

    it('records skipped_non_authoritative and changes nothing', async () => {
      const before = await seed();
      const status = await h.reconcile(inventory('1', [], false));
      expect(status.lastResult).toBe('skipped_non_authoritative');
      expect(await snapshot(h)).toEqual(before);
    });

    it.each([
      ['an unsupported inventory capability', () => unsupportedCapability()],
      ['an unreachable sidecar', () => new SidecarUnavailableError('down')],
    ])('records skipped_unavailable for %s and changes nothing', async (_name, error) => {
      const before = await seed();
      const status = await h.reconcile(error());
      expect(status.lastResult).toBe('skipped_unavailable');
      expect(await snapshot(h)).toEqual(before);
    });

    it('does not even ask a sidecar that advertises no inventory, or one that is not connected', async () => {
      const before = await seed();
      h.sidecar.requests.length = 0;
      h.sidecar.inventoryAvailable = false;
      expect((await h.reconciliation.request()).lastResult).toBe('skipped_unavailable');
      h.sidecar.inventoryAvailable = true;
      h.sidecar.state = 'degraded';
      expect((await h.reconciliation.request()).lastResult).toBe('skipped_unavailable');
      expect(h.sidecar.requests).toEqual([]);
      expect(await snapshot(h)).toEqual(before);
    });

    it('records failed for a timeout or any other error and changes nothing', async () => {
      const before = await seed();
      expect((await h.reconcile(timeoutError())).lastResult).toBe('failed');
      expect((await h.reconcile(new Error('boom'))).lastResult).toBe('failed');
      expect(await snapshot(h)).toEqual(before);
    });

    it('keeps the fabric the last applied run saw', async () => {
      await seed();
      const status = await h.reconcile(unsupportedCapability());
      expect(status.sidecarFabricId).toBe('1');
      expect(status.lastFinishedAt).not.toBeNull();
    });

    it('reports skipped_unavailable on a fresh install', async () => {
      h.sidecar.inventoryAvailable = false;
      const status = await h.reconciliation.request();
      expect(status).toMatchObject({ lastResult: 'skipped_unavailable', lastSummary: { changeCount: 0 } });
      expect(await nodes(h).count()).toBe(0);
    });
  });

  describe('restore mismatch', () => {
    it('detaches the old fabric’s nodes and quarantines the new fabric’s, even with equal node IDs and serials', async () => {
      await h.reconcile(inventory('1', [node('5'), node('6')]));
      const old = await live(h, '5');
      await h.lifecycle.claim(old.id, { displayName: 'Press' }, ADMIN);
      h.audit.mockClear();
      const status = await h.reconcile(inventory('2', [node('5'), node('7')]));
      expect(status.lastSummary?.changes).toMatchObject({ nodesDetached: 2, nodesQuarantined: 2, fabricsChanged: 2 });
      expect(await nodes(h).findOneByOrFail({ id: old.id })).toMatchObject({
        lifecycleState: 'detached',
        detachedReason: 'fabric_mismatch',
        displayName: 'Press',
      });
      const fresh = await live(h, '5', '2');
      expect(fresh).toMatchObject({ lifecycleState: 'unclaimed', displayName: null });
      expect(fresh.id).not.toBe(old.id);
      const fabrics = await h.dataSource.getRepository(MatterFabric).find({ order: { fabricId: 'ASC' } });
      expect(fabrics.map((f) => [f.fabricId, f.status])).toEqual([
        ['1', 'absent'],
        ['2', 'active'],
      ]);
      expect(h.actions().sort()).toEqual(
        [
          'matter.fabric_mismatch_detected',
          'matter.node_detached',
          'matter.node_detached',
          'matter.node_quarantined',
          'matter.node_quarantined',
        ].sort(),
      );
      // Idempotent afterwards, and a mismatch is not auto-resolved.
      expect((await h.reconcile(inventory('2', [node('5'), node('7')]))).lastSummary?.changeCount).toBe(0);
    });

    it('detaches every live node with fabric_absent when the sidecar fabric is uninitialized', async () => {
      await h.reconcile(inventory('1', [node('5'), node('6')]));
      h.audit.mockClear();
      const status = await h.reconcile(inventory(null, []));
      expect(status.lastResult).toBe('applied');
      expect(status.lastSummary?.changes.nodesDetached).toBe(2);
      expect((await nodes(h).find()).map((n) => n.detachedReason)).toEqual(['fabric_absent', 'fabric_absent']);
      expect((await h.reconcile(inventory(null, []))).lastSummary?.changeCount).toBe(0);
      // The same fabric coming back re-attaches those nodes by exact identity.
      const back = await h.reconcile(inventory('1', [node('5'), node('6')]));
      expect(back.lastSummary?.changes.nodesReattached).toBe(2);
    });

    it('treats a new fabric after an uninitialized sidecar as a mismatch', async () => {
      await h.reconcile(inventory('1', [node('5')]));
      const old = await live(h, '5');
      await h.reconcile(inventory(null, []));
      h.audit.mockClear();
      const status = await h.reconcile(inventory('2', [node('5')]));
      expect(status.lastSummary?.changes).toMatchObject({ nodesDetached: 1, nodesQuarantined: 1 });
      expect(await nodes(h).findOneByOrFail({ id: old.id })).toMatchObject({ detachedReason: 'fabric_mismatch' });
      expect(h.actions().sort()).toEqual(
        ['matter.fabric_mismatch_detected', 'matter.node_detached', 'matter.node_quarantined'].sort(),
      );
      expect((await h.reconcile(inventory('2', [node('5')]))).lastSummary?.changeCount).toBe(0);
      // The old fabric returning does not re-attach them by itself any more.
      const back = await h.reconcile(inventory('1', [node('5')]));
      expect(back.lastSummary?.observed.mismatchedStillListed).toBe(1);
      expect((await nodes(h).findOneByOrFail({ id: old.id })).lifecycleState).toBe('detached');
    });

    it('keeps fabric_mismatch nodes detached when their fabric returns, and repair brings them back', async () => {
      await h.reconcile(inventory('1', [node('5')]));
      const old = await live(h, '5');
      await h.lifecycle.claim(old.id, { displayName: 'Press' }, ADMIN);
      await h.reconcile(inventory('2', [node('5')]));
      const back = await h.reconcile(inventory('1', [node('5')]));
      expect(back.lastResult).toBe('applied');
      expect(back.lastSummary?.observed.mismatchedStillListed).toBe(1);
      const fabrics = await h.dataSource.getRepository(MatterFabric).find({ order: { fabricId: 'ASC' } });
      expect(fabrics.map((f) => [f.fabricId, f.status])).toEqual([
        ['1', 'active'],
        ['2', 'absent'],
      ]);
      expect(await nodes(h).countBy({ nodeId: '5', fabricRef: old.fabricRef })).toBe(1);
      h.sidecar.fabricId = '1';
      const repaired = await h.lifecycle.repair(old.id, ADMIN);
      expect(repaired).toMatchObject({ id: old.id, lifecycleState: 'claimed', displayName: 'Press' });
    });

    it('quarantines the unknown nodes when the plugin database is older than the sidecar', async () => {
      await h.reconcile(inventory('1', [node('5')]));
      const status = await h.reconcile(inventory('1', [node('5'), node('8'), node('9')]));
      expect(status.lastSummary?.changes).toMatchObject({ nodesQuarantined: 2, nodesDetached: 0 });
      expect((await live(h, '8')).lifecycleState).toBe('unclaimed');
    });

    it('detaches the missing nodes when the plugin database is newer than the sidecar', async () => {
      await h.reconcile(inventory('1', [node('5'), node('8'), node('9')]));
      const status = await h.reconcile(inventory('1', [node('5')]));
      expect(status.lastSummary?.changes).toMatchObject({ nodesDetached: 2, nodesQuarantined: 0 });
      expect((await live(h, '9')).detachedReason).toBe('absent_from_sidecar');
    });

    it('restores names and UUIDs through a relink afterwards', async () => {
      await h.reconcile(inventory('1', [node('5')]));
      const old = await live(h, '5');
      await h.lifecycle.claim(old.id, { displayName: 'Press' }, ADMIN);
      await h.reconcile(inventory('2', [node('5', { serialNumber: 'SN-5' })]));
      const fresh = await live(h, '5', '2');
      const relinked = await h.lifecycle.relink(old.id, { sourceNodeId: fresh.id }, ADMIN);
      expect(relinked).toMatchObject({ id: old.id, displayName: 'Press', lifecycleState: 'claimed', nodeId: '5' });
      expect(relinked.fabricRef).toBe(fresh.fabricRef);
      expect(await nodes(h).findOneByOrFail({ id: fresh.id })).toMatchObject({
        lifecycleState: 'removed',
        removalReason: 'merged',
        mergedInto: old.id,
      });
      // The next run sees the relinked node as known and changes nothing.
      expect((await h.reconcile(inventory('2', [node('5')]))).lastSummary?.changeCount).toBe(0);
    });
  });

  it('survives an inventory that lists an endpoint or a cluster twice', async () => {
    const twice = node('5', {
      endpoints: [endpoint(1, [0x0006, 0x0006]), endpoint(1, [0x0008])],
    });
    const status = await h.reconcile(inventory('1', [twice]));
    expect(status.lastResult).toBe('applied');
    expect(await h.dataSource.getRepository(MatterEndpoint).count()).toBe(1);
    expect(await h.dataSource.getRepository(MatterEndpointCluster).count()).toBe(1);
  });

  it('refreshes an endpoint’s last-seen time from the sidecar’s observation', async () => {
    await h.reconcile(inventory('1', [node('5')]));
    await h.reconcile(inventory('1', [node('5', { observedAt: '2026-10-30T10:00:00.000Z' })]));
    const endpoints = await h.dataSource.getRepository(MatterEndpoint).find();
    expect(endpoints.map((e) => e.lastSeenAt)).toEqual(['2026-10-30T10:00:00.000Z', '2026-10-30T10:00:00.000Z']);
  });

  it('attributes automatic runs to the system and manual ones to the administrator', async () => {
    await h.reconcile(inventory('1', [node('5')]));
    const [system] = h.audit.mock.calls[0] as unknown as [{ principal: { userId: number }; details: object }];
    expect(system).toMatchObject({ principal: { userId: 1 }, details: { initiator: 'system', fabricId: '1' } });
    h.audit.mockClear();
    h.sidecar.list = inventory('1', [node('5'), node('6')]);
    await h.reconciliation.request(ADMIN);
    const [manual] = h.audit.mock.calls[0] as unknown as [{ principal: { userId: number }; details: object }];
    expect(manual).toMatchObject({ principal: { userId: 7 }, details: { initiator: 'administrator' } });
  });

  describe('single flight', () => {
    it('coalesces triggers that arrive during a run into one follow-up run', async () => {
      h.sidecar.list = inventory('1', [node('5')]);
      h.sidecar.listDelayMs = 30;
      const runs = [h.reconciliation.request(), h.reconciliation.request(), h.reconciliation.request()];
      await Promise.all(runs);
      expect(h.sidecar.requests.filter((r) => r === 'inventory.list')).toHaveLength(2);
      expect(await nodes(h).count()).toBe(1);
      const [, second, third] = await Promise.all(runs);
      expect(second).toEqual(third);
    });

    it('gives the follow-up run the administrator who joined it, not the automatic trigger', async () => {
      h.sidecar.list = inventory('1', []);
      h.sidecar.listDelayMs = 30;
      const first = h.reconciliation.request();
      const joined = [h.reconciliation.request(), h.reconciliation.request(ADMIN)];
      await first;
      // The follow-up reads the inventory only after its delay.
      h.sidecar.list = inventory('1', [node('5')]);
      await Promise.all(joined);
      expect(h.actions()).toEqual(['matter.node_quarantined']);
      const [entry] = h.audit.mock.calls.at(-1) as unknown as [{ principal: { userId: number }; details: object }];
      expect(entry).toMatchObject({ principal: { userId: 7 }, details: { initiator: 'administrator' } });
    });
  });
});
