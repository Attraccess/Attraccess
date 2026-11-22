// Removal from the fabric: normal (RemoveFabric for the Attraccess fabric only), unreachable device, and force removal
// with the device stopped and with the device running (proof that force never contacts it). Needs mDNS over loopback.
import { openSharingWindow, commissionVirtualDevice } from '../../../matter-sidecar/src/testing/virtual-device';
import { matterStorage } from '../backend/plugin-storage/access';
import {
  ADMIN_ONLY,
  Cleanup,
  COMMISSIONER,
  OPERATOR,
  TEST_PAA,
  auditActions,
  commission,
  everythingStored,
  expectNoSecrets,
  loopbackMdns,
  nodeDetail,
  nodeList,
  storedBackups,
  until,
  type Stack,
} from './commissioning.test-utils';

const remove = (stack: Stack, id: string, mode: 'normal' | 'force', headers = COMMISSIONER) =>
  stack.api().post(`/api/matter/nodes/${id}/remove`).set(headers).send({ mode, confirm: true });
const generation = async (stack: Stack): Promise<number> =>
  (await stack.api().get('/api/matter/fabric').set(ADMIN_ONLY).expect(200)).body.sidecar.fabricGeneration;
/** Node IDs the sidecar's controller lists now, read from the sidecar itself rather than the plugin's records. */
const sidecarNodeIds = async (stack: Stack): Promise<string[]> => {
  const listed = await stack.rig.call('GET', '/v1/nodes');
  expect(listed.status).toBe(200);
  return (listed.body.nodes as { nodeId: string }[]).map((node) => node.nodeId);
};
const reconcile = (stack: Stack) => stack.api().post('/api/matter/reconciliation').set(OPERATOR).expect(200);

describe('removal from the fabric', () => {
  const mdns = loopbackMdns();
  const cleanup = new Cleanup();
  beforeAll(() => mdns.start());
  afterAll(() => mdns.stop());
  afterEach(() => cleanup.all());

  it('removes only the Attraccess fabric, keeps history, retires the endpoints and backs up; a removed node is never re-claimed', async () => {
    const light = await cleanup.device();
    const other = await cleanup.second();
    const otherNodeId = await commissionVirtualDevice(other.controller, light);
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const sharing = await openSharingWindow(other.controller, otherNodeId);
    const session = await commission(stack, sharing.manual);
    expect(session.state).toBe('succeeded');
    expect(light.fabricIds()).toHaveLength(2);
    const before = await generation(stack);

    const removed = await remove(stack, session.nodeRecordId, 'normal');

    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({
      lifecycleState: 'removed',
      removalReason: 'removed_from_fabric',
      removedBy: 7,
    });
    // The other ecosystem keeps its fabric; the device was not factory-reset.
    expect(light.fabricIds()).toEqual([other.fabricId]);
    expect(await generation(stack)).toBe(before + 1);
    const { tables } = matterStorage(stack.host.context);
    const endpoints = await tables.endpoints.find({ where: { nodeRef: session.nodeRecordId } });
    expect(endpoints.length).toBeGreaterThan(0);
    expect(endpoints.every((endpoint) => endpoint.removedAt !== null)).toBe(true);
    expect(await tables.nodes.count({ id: session.nodeRecordId })).toBe(1);
    expect(auditActions(stack)).toEqual(
      expect.arrayContaining(['matter.node_commissioned', 'matter.node_removed_from_fabric']),
    );
    // Removed nodes stay visible with their history, but cannot be claimed or repaired again.
    expect(await nodeList(stack, '?lifecycleState=removed')).toHaveLength(1);
    expect(
      (await stack.api().post(`/api/matter/nodes/${session.nodeRecordId}/claim`).set(OPERATOR).send({})).status,
    ).toBe(409);
    // A second removal has nothing left to remove.
    const removedAgain = await remove(stack, session.nodeRecordId, 'normal');
    expect(removedAgain.status).toBe(409);
    expect(removedAgain.body.code).toBe('not_removable');

    // The change is backed up on its own.
    const backup = await until(
      async () =>
        (await storedBackups(stack)).find(
          (entry) => entry.trigger === 'fabric_changed' && entry.fabricGeneration >= before + 1,
        ),
      90_000,
      'the fabric_changed backup after the removal',
    );
    expect(backup).toBeTruthy();

    // Commissioning the device again creates a new record; the removed one stays as history.
    const reopened = await openSharingWindow(other.controller, otherNodeId);
    const again = await commission(stack, reopened.qr);
    expect(again.state).toBe('succeeded');
    expect(again.nodeRecordId).not.toBe(session.nodeRecordId);
    expect(await nodeList(stack)).toHaveLength(2);
    expectNoSecrets(await everythingStored(stack), light, [sharing.manual, sharing.qr, reopened.manual, reopened.qr]);
  }, 300_000);

  it('refuses to remove an unreachable device normally, changes nothing, then force-removes it without contacting it', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const session = await commission(stack, light.codes.qr);
    expect(session.state).toBe('succeeded');
    const before = await generation(stack);
    const { nodeId } = await nodeDetail(stack, session.nodeRecordId);
    await light.stop();

    const refused = await remove(stack, session.nodeRecordId, 'normal');

    expect(refused.status).toBe(409);
    expect(['device_unreachable', 'timeout']).toContain(refused.body.code);
    expect(await generation(stack)).toBe(before);
    expect(await nodeDetail(stack, session.nodeRecordId)).toMatchObject({ lifecycleState: 'claimed' });
    expect(auditActions(stack)).toContain('matter.node_removal_failed');
    expect(auditActions(stack)).not.toContain('matter.node_removed_from_fabric');

    const forced = await remove(stack, session.nodeRecordId, 'force');

    expect(forced.status).toBe(200);
    expect(forced.body).toMatchObject({ lifecycleState: 'removed', removalReason: 'forced_from_fabric' });
    expect(await generation(stack)).toBe(before + 1);
    expect(auditActions(stack)).toContain('matter.node_force_removed_from_fabric');
    const { tables } = matterStorage(stack.host.context);
    expect(
      (await tables.endpoints.find({ where: { nodeRef: session.nodeRecordId } })).every((e) => e.removedAt !== null),
    ).toBe(true);
    // The sidecar forgot the node, so a reconciliation does not bring it back.
    expect(await sidecarNodeIds(stack)).not.toContain(nodeId);
    await reconcile(stack);
    expect(await nodeList(stack)).toHaveLength(1);
  }, 300_000);

  it('force-removes a running device without contacting it: the device still lists the Attraccess fabric', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const session = await commission(stack, light.codes.qr);
    expect(session.state).toBe('succeeded');
    const { nodeId } = await nodeDetail(stack, session.nodeRecordId);
    expect(await sidecarNodeIds(stack)).toContain(nodeId);
    expect(light.fabricIds()).toEqual([stack.fabricId]);
    const before = await generation(stack);

    const forced = await remove(stack, session.nodeRecordId, 'force');

    expect(forced.status).toBe(200);
    expect(forced.body).toMatchObject({ lifecycleState: 'removed', removalReason: 'forced_from_fabric' });
    expect(await generation(stack)).toBe(before + 1);
    expect(await sidecarNodeIds(stack)).not.toContain(nodeId);
    expect(auditActions(stack)).toContain('matter.node_force_removed_from_fabric');
    expect(auditActions(stack)).not.toContain('matter.node_removed_from_fabric');
    // Read from the running device now: no RemoveFabric reached it, so it still holds the Attraccess credentials.
    expect(light.fabricIds()).toEqual([stack.fabricId]);
    // A reconciliation afterwards neither brings the node back nor changes the device.
    await reconcile(stack);
    expect(await nodeList(stack)).toHaveLength(1);
    expect(light.fabricIds()).toEqual([stack.fabricId]);
  }, 300_000);

  it('requires the explicit confirmation and the commission permission', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const session = await commission(stack, light.codes.manual11);
    const url = `/api/matter/nodes/${session.nodeRecordId}/remove`;
    expect((await stack.api().post(url).set(COMMISSIONER).send({ mode: 'normal' })).status).toBe(400);
    expect((await stack.api().post(url).set(COMMISSIONER).send({ mode: 'normal', confirm: false })).status).toBe(400);
    expect((await remove(stack, session.nodeRecordId, 'normal', ADMIN_ONLY)).status).toBe(403);
    expect(light.fabricIds()).toContain(stack.fabricId);
  }, 180_000);
});
