import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MatterCommand, MatterEndpoint, MatterEndpointCluster, MatterEndpointState, MatterNode } from './entities';
import { auditSubjectId } from './audit.service';
import { metadataSchema } from './schemas';
import {
  ADMIN,
  createHarness,
  endpoint,
  inventory,
  node,
  unsupportedCapability,
  type Harness,
} from '../testing/devices-harness.test-utils';

const findNode = (h: Harness, nodeId: string, fabricId = '1') =>
  h.dataSource
    .getRepository(MatterNode)
    .createQueryBuilder('n')
    .innerJoin('plugin_matter_fabrics', 'f', 'f.id = n.fabric_ref')
    .where('n.nodeId = :nodeId AND f.fabric_id = :fabricId AND n.removedAt IS NULL', { nodeId, fabricId })
    .getOneOrFail();

describe('Matter lifecycle actions', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.close());

  const seed = async (...ids: string[]) => {
    await h.reconcile(
      inventory(
        '1',
        ids.map((id) => node(id)),
      ),
    );
    h.audit.mockClear();
  };
  const lastAudit = () => (h.audit.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0];

  it('answers 404 for unknown IDs and 409 for invalid transitions', async () => {
    await seed('5');
    const unclaimed = await findNode(h, '5');
    await expect(h.lifecycle.claim(randomUUID(), {}, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.lifecycle.getNode(randomUUID())).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.lifecycle.updateEndpoint(randomUUID(), { displayName: 'x' }, ADMIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(h.lifecycle.restore(unclaimed.id, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    await expect(h.lifecycle.relink(unclaimed.id, { sourceNodeId: unclaimed.id }, ADMIN)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await h.lifecycle.claim(unclaimed.id, {}, ADMIN);
    await expect(h.lifecycle.claim(unclaimed.id, {}, ADMIN)).rejects.toThrow(
      /The node is claimed. Only a node that is unclaimed can be claimed/,
    );
    await expect(h.lifecycle.archive(unclaimed.id, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    await h.lifecycle.forceRemove(unclaimed.id, ADMIN);
    for (const action of ['claim', 'archive', 'restore', 'forceRemove', 'repair'] as const) {
      await expect(
        (h.lifecycle[action] as (id: string, a: unknown, b?: unknown) => Promise<unknown>)(unclaimed.id, {}, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
    }
    await expect(h.lifecycle.updateNode(unclaimed.id, { displayName: 'x' }, ADMIN)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('claims an unclaimed node with an optional name and audits it', async () => {
    await seed('5');
    const claimed = await h.lifecycle.claim((await findNode(h, '5')).id, { displayName: 'Press' }, ADMIN);
    expect(claimed).toMatchObject({ lifecycleState: 'claimed', displayName: 'Press', claimedBy: 7 });
    expect(claimed.claimedAt).not.toBeNull();
    expect(lastAudit()).toMatchObject({
      action: 'matter.node_claimed',
      principal: ADMIN,
      subject: { type: 'matter.node', id: auditSubjectId(claimed.id) },
      details: { nodeRef: claimed.id, nameSet: true },
    });
  });

  it('archives a detached or unclaimed node and restores it to detached, and a reconcile re-attaches it', async () => {
    await seed('5');
    const id = (await findNode(h, '5')).id;
    await h.lifecycle.claim(id, {}, ADMIN);
    await expect(h.lifecycle.archive(id, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    await h.reconcile(inventory('1', []));
    h.audit.mockClear();
    expect(await h.lifecycle.archive(id, ADMIN)).toMatchObject({ lifecycleState: 'archived', archivedBy: 7 });
    expect(lastAudit()).toMatchObject({ action: 'matter.node_archived', details: { previousState: 'detached' } });
    expect(await h.lifecycle.restore(id, ADMIN)).toMatchObject({ lifecycleState: 'detached', archivedAt: null });
    expect(lastAudit()).toMatchObject({ action: 'matter.node_restored' });
    await h.reconcile(inventory('1', [node('5')]));
    expect(await h.dataSource.getRepository(MatterNode).findOneByOrFail({ id })).toMatchObject({
      lifecycleState: 'claimed',
    });
  });

  it('keeps a fabric mismatch through archive and restore, so it is not re-attached by itself', async () => {
    await seed('5', '6');
    const id = (await findNode(h, '5')).id;
    const archivedEarly = (await findNode(h, '6')).id;
    await h.lifecycle.archive(archivedEarly, ADMIN);
    await h.reconcile(inventory('2', []));
    expect(await h.lifecycle.restore(archivedEarly, ADMIN)).toMatchObject({ detachedReason: 'fabric_mismatch' });
    await h.lifecycle.archive(id, ADMIN);
    expect(await h.lifecycle.restore(id, ADMIN)).toMatchObject({
      lifecycleState: 'detached',
      detachedReason: 'fabric_mismatch',
    });
    await h.reconcile(inventory('1', [node('5')]));
    expect((await h.dataSource.getRepository(MatterNode).findOneByOrFail({ id })).lifecycleState).toBe('detached');
  });

  it('archives an unclaimed node', async () => {
    await seed('5');
    const archived = await h.lifecycle.archive((await findNode(h, '5')).id, ADMIN);
    expect(archived.lifecycleState).toBe('archived');
    expect(lastAudit()).toMatchObject({ details: { previousState: 'unclaimed' } });
  });

  describe('force-remove', () => {
    it('keeps history, marks endpoints removed, and leaves the sidecar alone', async () => {
      await seed('5');
      const id = (await findNode(h, '5')).id;
      h.sidecar.requests.length = 0;
      const removed = await h.lifecycle.forceRemove(id, ADMIN);
      expect(removed).toMatchObject({ lifecycleState: 'removed', removalReason: 'force_removed', removedBy: 7 });
      expect(removed.removedAt).not.toBeNull();
      const endpoints = await h.dataSource.getRepository(MatterEndpoint).find();
      expect(endpoints).toHaveLength(2);
      expect(endpoints.every((e) => e.removedAt !== null && e.removalReason === 'force_removed')).toBe(true);
      expect((await h.dataSource.getRepository(MatterEndpointCluster).find()).every((c) => c.removedAt !== null)).toBe(
        true,
      );
      expect(h.sidecar.requests).toEqual([]);
      expect(lastAudit()).toMatchObject({
        action: 'matter.node_force_removed',
        details: { previousState: 'unclaimed' },
      });
    });

    it('lets a node the sidecar still lists reappear as a new unclaimed row', async () => {
      await seed('5');
      const old = await findNode(h, '5');
      await h.lifecycle.claim(old.id, { displayName: 'Press' }, ADMIN);
      await h.lifecycle.forceRemove(old.id, ADMIN);
      const status = await h.reconcile(inventory('1', [node('5')]));
      expect(status.lastSummary?.changes.nodesQuarantined).toBe(1);
      const fresh = await findNode(h, '5');
      expect(fresh.id).not.toBe(old.id);
      expect(fresh).toMatchObject({ lifecycleState: 'unclaimed', displayName: null });
      expect(await h.dataSource.getRepository(MatterNode).count()).toBe(2);
    });
  });

  describe('relink', () => {
    const detachedWithState = async () => {
      await h.reconcile(inventory('1', [node('5', { endpoints: [endpoint(0, [0x0028]), endpoint(1, [0x0006])] })]));
      const target = await findNode(h, '5');
      await h.lifecycle.claim(target.id, { displayName: 'Press' }, ADMIN);
      await h.lifecycle.updateNode(target.id, { location: 'Hall' }, ADMIN);
      const targetEndpoint = await h.dataSource
        .getRepository(MatterEndpoint)
        .findOneByOrFail({ nodeRef: target.id, endpointId: 1 });
      await h.lifecycle.updateEndpoint(targetEndpoint.id, { displayName: 'Socket' }, ADMIN);
      await h.reconcile(inventory('1', []));
      return { target, targetEndpoint };
    };

    it('moves identity, endpoints, clusters and state onto the detached record and keeps its UUIDs and names', async () => {
      const { target, targetEndpoint } = await detachedWithState();
      // A replacement node on the same fabric, with an extra endpoint.
      await h.reconcile(
        inventory('1', [
          node('9', {
            serialNumber: 'SN-5',
            endpoints: [endpoint(0, [0x0028]), endpoint(1, [0x0006, 0x0008]), endpoint(2, [0x0045])],
          }),
        ]),
      );
      const source = await findNode(h, '9');
      const sourceEndpoint = await h.dataSource
        .getRepository(MatterEndpoint)
        .findOneByOrFail({ nodeRef: source.id, endpointId: 1 });
      await h.state.ingestReport(
        {
          nodeId: '9',
          endpointId: 1,
          clusterId: 6,
          attributeId: 0,
          value: true,
          observedAt: '2026-10-29T10:00:00.000Z',
          source: 'read',
        },
        '2026-10-29T10:00:01.000Z',
      );
      h.audit.mockClear();

      const result = await h.lifecycle
        .relink(target.id, { sourceNodeId: source.id, confirmIdentityMismatch: undefined }, ADMIN)
        .catch((e) => e);
      // Node IDs differ and so does the serial? No: serial matches, so no confirmation is needed.
      expect(result).toMatchObject({
        id: target.id,
        nodeId: '9',
        lifecycleState: 'claimed',
        displayName: 'Press',
        location: 'Hall',
      });
      expect(await h.dataSource.getRepository(MatterNode).findOneByOrFail({ id: source.id })).toMatchObject({
        lifecycleState: 'removed',
        removalReason: 'merged',
        mergedInto: target.id,
      });
      const endpoints = await h.dataSource.getRepository(MatterEndpoint).find({ where: { removedAt: null as never } });
      const liveEndpoints = endpoints.filter((e) => e.removedAt === null);
      expect(
        liveEndpoints
          .filter((e) => e.nodeRef === target.id)
          .map((e) => e.endpointId)
          .sort(),
      ).toEqual([0, 1, 2]);
      const kept = liveEndpoints.find((e) => e.nodeRef === target.id && e.endpointId === 1);
      expect(kept).toMatchObject({ id: targetEndpoint.id, displayName: 'Socket' });
      expect(await h.dataSource.getRepository(MatterEndpoint).findOneByOrFail({ id: sourceEndpoint.id })).toMatchObject(
        {
          removalReason: 'merged',
        },
      );
      const states = await h.dataSource.getRepository(MatterEndpointState).find();
      expect(states).toHaveLength(1);
      expect(states[0]).toMatchObject({ endpointRef: targetEndpoint.id, reportedValue: 'true' });
      const clusters = (await h.dataSource.getRepository(MatterEndpointCluster).find()).filter(
        (c) => c.endpointRef === targetEndpoint.id && c.removedAt === null,
      );
      expect(clusters.map((c) => c.clusterId).sort()).toEqual([6, 8]);
      expect(lastAudit()).toMatchObject({
        action: 'matter.node_relinked',
        details: { nodeRef: target.id, sourceNodeRef: source.id, identityMismatchConfirmed: false },
      });
      // Idempotent against the sidecar's view afterwards.
      expect(
        (
          await h.reconcile(
            inventory('1', [
              node('9', {
                serialNumber: 'SN-5',
                endpoints: [endpoint(0, [0x0028]), endpoint(1, [0x0006, 0x0008]), endpoint(2, [0x0045])],
              }),
            ]),
          )
        ).lastSummary?.changeCount,
      ).toBe(0);
    });

    it('returns 409 on a vendor, product or serial mismatch unless confirmed, and records the confirmation', async () => {
      const { target } = await detachedWithState();
      await h.reconcile(inventory('1', [node('9', { vendorName: 'Other', serialNumber: 'DIFFERENT', productId: 77 })]));
      const source = await findNode(h, '9');
      await expect(h.lifecycle.relink(target.id, { sourceNodeId: source.id }, ADMIN)).rejects.toThrow(
        /productId, serialNumber/,
      );
      expect((await h.dataSource.getRepository(MatterNode).findOneByOrFail({ id: source.id })).lifecycleState).toBe(
        'unclaimed',
      );
      await h.lifecycle.relink(target.id, { sourceNodeId: source.id, confirmIdentityMismatch: true }, ADMIN);
      expect(lastAudit()).toMatchObject({ details: { identityMismatchConfirmed: true } });
    });

    it('requires a detached target and an unclaimed source', async () => {
      await seed('5', '6');
      const [a, b] = [await findNode(h, '5'), await findNode(h, '6')];
      await expect(h.lifecycle.relink(a.id, { sourceNodeId: b.id }, ADMIN)).rejects.toThrow(
        /Only a node that is detached can be relinked/,
      );
      await h.reconcile(inventory('1', [node('6')]));
      await h.lifecycle.claim(b.id, {}, ADMIN);
      await expect(h.lifecycle.relink(a.id, { sourceNodeId: b.id }, ADMIN)).rejects.toThrow(
        /source node must be unclaimed/,
      );
      await expect(h.lifecycle.relink(a.id, { sourceNodeId: randomUUID() }, ADMIN)).rejects.toThrow(
        /Unknown source node/,
      );
    });

    it('leaves a never-claimed target unclaimed, and keeps the state of the endpoints it retires', async () => {
      await h.reconcile(inventory('1', [node('5', { endpoints: [endpoint(1, [0x0006]), endpoint(2, [0x0006])] })]));
      const target = await findNode(h, '5');
      const retiring = await h.dataSource
        .getRepository(MatterEndpoint)
        .findOneByOrFail({ nodeRef: target.id, endpointId: 2 });
      await h.state.ingestReport(
        {
          nodeId: '5',
          endpointId: 2,
          clusterId: 6,
          attributeId: 0,
          value: true,
          observedAt: '2026-10-29T10:00:00.000Z',
          source: 'read',
        },
        '2026-10-29T10:00:00.000Z',
      );
      await h.reconcile(inventory('1', []));
      await h.reconcile(
        inventory('1', [node('9', { serialNumber: 'SN-5', uniqueId: 'U-5', endpoints: [endpoint(1)] })]),
      );
      const source = await findNode(h, '9');
      const relinked = await h.lifecycle.relink(target.id, { sourceNodeId: source.id }, ADMIN);
      expect(relinked).toMatchObject({ lifecycleState: 'unclaimed', claimedAt: null, claimedBy: null });
      expect(await h.dataSource.getRepository(MatterEndpoint).findOneByOrFail({ id: retiring.id })).toMatchObject({
        removalReason: 'absent_from_sidecar',
      });
      expect(await h.state.read(retiring.id)).toHaveLength(1);
    });

    it('retires a target endpoint when other bridged hardware sits behind the same endpoint ID', async () => {
      const bridged = (uniqueId: string) =>
        endpoint(3, [0x0006], {
          bridged: {
            uniqueId,
            nodeLabel: null,
            vendorName: null,
            productName: null,
            serialNumber: null,
            reachable: true,
          },
        });
      await h.reconcile(inventory('1', [node('5', { endpoints: [bridged('A')] })]));
      const target = await findNode(h, '5');
      await h.reconcile(inventory('1', [node('9', { endpoints: [bridged('B')] })]));
      const source = await findNode(h, '9');
      await h.lifecycle.relink(target.id, { sourceNodeId: source.id, confirmIdentityMismatch: true }, ADMIN);
      const rows = await h.dataSource.getRepository(MatterEndpoint).find();
      const liveRows = rows.filter((row) => row.removedAt === null);
      expect(liveRows).toHaveLength(1);
      expect(liveRows[0]).toMatchObject({ nodeRef: target.id, bridgedUniqueId: 'B' });
      expect(rows.find((row) => row.bridgedUniqueId === 'A')?.removalReason).toBe('replaced');
    });
  });

  describe('repair', () => {
    it('re-attaches a detached node that the sidecar reports with the same identity', async () => {
      await seed('5');
      const id = (await findNode(h, '5')).id;
      await h.reconcile(inventory('1', []));
      h.audit.mockClear();
      h.sidecar.fabricId = '1';
      h.sidecar.list = inventory('1', [node('5', { softwareVersion: 9, endpoints: [endpoint(1, [0x0045])] })]);
      const repaired = await h.lifecycle.repair(id, ADMIN);
      expect(repaired).toMatchObject({ lifecycleState: 'unclaimed', detachedReason: null, softwareVersion: 9 });
      expect(lastAudit()).toMatchObject({ action: 'matter.node_repaired', details: { reattached: true } });
      const profiles = (await h.dataSource.getRepository(MatterEndpoint).find()).filter((e) => e.removedAt === null);
      expect(profiles.map((e) => [e.endpointId, e.profile])).toEqual([[1, 'contact_sensor']]);
    });

    it('refreshes a claimed node without changing its state', async () => {
      await seed('5');
      const id = (await findNode(h, '5')).id;
      await h.lifecycle.claim(id, {}, ADMIN);
      h.sidecar.fabricId = '1';
      h.sidecar.list = inventory('1', [node('5', { productName: 'Plug 2' })]);
      expect(await h.lifecycle.repair(id, ADMIN)).toMatchObject({ lifecycleState: 'claimed', productName: 'Plug 2' });
      expect(lastAudit()).toMatchObject({ details: { reattached: false } });
    });

    it('refuses while the node’s fabric is not the active one, so two fabrics are never active', async () => {
      await seed('5');
      const id = (await findNode(h, '5')).id;
      await h.reconcile(inventory(null, []));
      h.sidecar.fabricId = '1';
      h.sidecar.list = inventory('1', [node('5')]);
      const before = await h.rows('plugin_matter_nodes');
      await expect(h.lifecycle.repair(id, ADMIN)).rejects.toThrow(/Run a reconciliation first/);
      expect(await h.rows('plugin_matter_nodes')).toEqual(before);
      await h.reconcile(inventory('1', [node('5')]));
      expect((await h.dataSource.getRepository(MatterNode).findOneByOrFail({ id })).lifecycleState).toBe('unclaimed');
    });

    it('changes nothing when the sidecar cannot answer, or runs another fabric, or does not list the node', async () => {
      await seed('5');
      const id = (await findNode(h, '5')).id;
      await h.reconcile(inventory('1', []));
      h.audit.mockClear();
      const before = await h.rows('plugin_matter_nodes');
      h.sidecar.fabricId = '1';
      h.sidecar.list = unsupportedCapability();
      await expect(h.lifecycle.repair(id, ADMIN)).rejects.toBeInstanceOf(ServiceUnavailableException);
      h.sidecar.state = 'degraded';
      await expect(h.lifecycle.repair(id, ADMIN)).rejects.toBeInstanceOf(ServiceUnavailableException);
      h.sidecar.state = 'connected';
      h.sidecar.list = inventory('1', []);
      await expect(h.lifecycle.repair(id, ADMIN)).rejects.toBeInstanceOf(ConflictException);
      h.sidecar.fabricId = '2';
      await expect(h.lifecycle.repair(id, ADMIN)).rejects.toThrow(/different fabric/);
      expect(await h.rows('plugin_matter_nodes')).toEqual(before);
      expect(h.audit).not.toHaveBeenCalled();
    });
  });

  describe('metadata', () => {
    it('edits only names, descriptions and locations, trims, clears with empty text, and audits changes only', async () => {
      await seed('5');
      const original = await findNode(h, '5');
      // The controller validates and normalizes with the schema before the service sees the input.
      const updated = await h.lifecycle.updateNode(
        original.id,
        metadataSchema.parse({ displayName: '  Press  ', description: 'Hydraulic', location: '' }),
        ADMIN,
      );
      expect(updated).toMatchObject({ displayName: 'Press', description: 'Hydraulic', location: null });
      expect(lastAudit()).toMatchObject({
        action: 'matter.node_metadata_updated',
        details: { displayNameChanged: true, descriptionChanged: true, locationChanged: false },
      });
      expect(updated).toMatchObject({
        nodeId: original.nodeId,
        vendorName: original.vendorName,
        serialNumber: original.serialNumber,
        fabricRef: original.fabricRef,
        lifecycleState: 'unclaimed',
      });
      h.audit.mockClear();
      await h.lifecycle.updateNode(original.id, { displayName: 'Press' }, ADMIN);
      expect(h.audit).not.toHaveBeenCalled();

      const target = await h.dataSource
        .getRepository(MatterEndpoint)
        .findOneByOrFail({ nodeRef: original.id, endpointId: 1 });
      const patched = await h.lifecycle.updateEndpoint(target.id, { location: 'Bench' }, ADMIN);
      expect(patched).toMatchObject({
        location: 'Bench',
        endpointId: 1,
        profile: target.profile,
        deviceTypes: target.deviceTypes,
      });
      expect(lastAudit()).toMatchObject({
        action: 'matter.endpoint_metadata_updated',
        subject: { type: 'matter.endpoint' },
        details: { endpointRef: target.id, endpointId: 1, locationChanged: true },
      });
    });
  });

  it('lists nodes hiding archived and removed ones unless asked, and returns the node with its tree', async () => {
    await seed('5', '6', '7');
    await h.reconcile(inventory('1', [node('5')]));
    await h.lifecycle.archive((await findNode(h, '6')).id, ADMIN);
    await h.lifecycle.forceRemove((await findNode(h, '7')).id, ADMIN);
    expect((await h.lifecycle.listNodes({})).map((n) => n.nodeId)).toEqual(['5']);
    expect((await h.lifecycle.listNodes({ includeInactive: true })).map((n) => n.nodeId)).toEqual(['5', '6', '7']);
    expect((await h.lifecycle.listNodes({ lifecycleState: 'removed' })).map((n) => n.nodeId)).toEqual(['7']);
    const detail = await h.lifecycle.getNode((await findNode(h, '5')).id);
    expect(detail.endpoints.map((e) => e.endpoint.endpointId)).toEqual([0, 1]);
    expect(detail.endpoints[1].capabilities.map((c) => c.capability).sort()).toEqual(['levelControl', 'onOff']);
    expect(detail.endpoints[1].clusters.map((c) => c.clusterId).sort()).toEqual([6, 8]);
    expect(detail.fabric?.fabricId).toBe('1');
    expect(await h.dataSource.getRepository(MatterCommand).count()).toBe(0);
  });
});
