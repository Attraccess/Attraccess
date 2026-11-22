// Multi-admin: a sharing code from another ecosystem (a second controller with its own fabric) is entered like any
// setup code, and Attraccess opens its own commissioning window for another controller. Needs mDNS over loopback.
import { openSharingWindow, commissionVirtualDevice } from '../../../matter-sidecar/src/testing/virtual-device';
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
  until,
  type Stack,
} from './commissioning.test-utils';

const shareUrl = (id: string) => `/api/matter/nodes/${id}/share`;
const openShare = (stack: Stack, id: string, body: { timeoutSec?: number } = {}, headers = COMMISSIONER) =>
  stack.api().post(shareUrl(id)).set(headers).send(body);
const closeShare = (stack: Stack, id: string, headers = COMMISSIONER) => stack.api().delete(shareUrl(id)).set(headers);

describe('multi-admin commissioning', () => {
  const mdns = loopbackMdns();
  const cleanup = new Cleanup();
  beforeAll(() => mdns.start());
  afterAll(() => mdns.stop());
  afterEach(() => cleanup.all());

  describe.each([
    ['the manual sharing code', (sharing: { manual: string; qr: string }) => sharing.manual],
    ['the sharing QR payload', (sharing: { manual: string; qr: string }) => sharing.qr],
  ])('with %s of another ecosystem', (_name, pick) => {
    it('joins a device that already belongs to another fabric and shows the other administrator, unattributed', async () => {
      const light = await cleanup.device();
      const other = await cleanup.second();
      const otherNodeId = await commissionVirtualDevice(other.controller, light);
      expect(light.fabricIds()).toEqual([other.fabricId]);
      const sharing = await openSharingWindow(other.controller, otherNodeId);
      const stack = await cleanup.stack({ tuning: TEST_PAA });

      const session = await commission(stack, pick(sharing));

      expect(session.state).toBe('succeeded');
      expect(light.fabricIds().sort()).toEqual([other.fabricId, stack.fabricId].sort());
      const detail = await nodeDetail(stack, session.nodeRecordId);
      expect(detail.lifecycleState).toBe('claimed');
      expect(detail.administrators).toHaveLength(2);
      expect(detail.administrators.filter((admin: { isOwn: boolean }) => admin.isOwn)).toHaveLength(1);
      expect(detail.administrators.filter((admin: { isOwn: boolean }) => !admin.isOwn)).toHaveLength(1);
      // Only the commissioning is attributed to the user; the other fabric is never an Attraccess actor or subject.
      const commissioned = stack.host.audit.find(
        (event) => (event as unknown as { action: string }).action === 'matter.node_commissioned',
      ) as unknown as { actor: { id: number | null } };
      expect(commissioned.actor.id).toBe(7);
      expect(JSON.stringify(stack.host.audit)).not.toContain(other.fabricId);
      expectNoSecrets(await everythingStored(stack), light, [sharing.manual, sharing.qr]);
    }, 240_000);
  });

  it('opens an outbound window for a second controller, which joins; closing the window answers closed', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const session = await commission(stack, light.codes.qr);
    expect(session.state).toBe('succeeded');

    const shared = await openShare(stack, session.nodeRecordId);
    expect(shared.status).toBe(200);
    expect(shared.body).toMatchObject({
      manualCode: expect.stringMatching(/^[0-9]{11}$|^[0-9]{21}$/),
      qrCode: expect.stringMatching(/^MT:/),
      expiresAt: expect.any(String),
    });
    expect(new Date(shared.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const other = await cleanup.second();
    await other.commissionWithCode(shared.body.manualCode);
    expect(light.fabricIds().sort()).toEqual([other.fabricId, stack.fabricId].sort());

    // A reconciliation refreshes the administrators the plugin shows.
    await stack.api().post('/api/matter/reconciliation').set(ADMIN_ONLY).expect(200);
    const refreshed = await until(
      async () => {
        const detail = await nodeDetail(stack, session.nodeRecordId);
        return detail.administrators.length === 2 ? detail : null;
      },
      30_000,
      'both administrators in the node detail',
    );
    expect(refreshed.administrators.filter((admin: { isOwn: boolean }) => !admin.isOwn)).toHaveLength(1);

    const closed = await closeShare(stack, session.nodeRecordId);
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual({ closed: expect.any(Boolean) });
    expect(auditActions(stack)).toEqual(expect.arrayContaining(['matter.node_shared', 'matter.node_share_revoked']));
    // The window codes live in the response only: never in a row, an audit record, a log line or an event.
    expectNoSecrets(await everythingStored(stack), light, [shared.body.manualCode, shared.body.qrCode]);
    expect(await nodeList(stack)).toHaveLength(1);
  }, 240_000);

  it('closing the window right away answers closed, and its code no longer lets another controller join', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const session = await commission(stack, light.codes.qr);
    expect(session.state).toBe('succeeded');

    const shared = await openShare(stack, session.nodeRecordId);
    expect(shared.status).toBe(200);
    const closed = await closeShare(stack, session.nodeRecordId);
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual({ closed: true });
    expect(auditActions(stack)).toEqual(expect.arrayContaining(['matter.node_shared', 'matter.node_share_revoked']));

    // The window is gone: the second controller's attempt with that code fails within its own bounded timeout.
    const other = await cleanup.second();
    await expect(other.commissionWithCode(shared.body.manualCode)).rejects.toBeDefined();
    expect(light.fabricIds()).toEqual([stack.fabricId]);
    expectNoSecrets(await everythingStored(stack), light, [shared.body.manualCode, shared.body.qrCode]);
  }, 240_000);

  it('accepts share windows of 180 to 900 seconds only, for a node in the fabric, with the commission permission', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const session = await commission(stack, light.codes.manual11);
    expect(session.state).toBe('succeeded');
    const id = session.nodeRecordId;

    expect((await openShare(stack, id, { timeoutSec: 60 })).status).toBe(400);
    expect((await openShare(stack, id, { timeoutSec: 179 })).status).toBe(400);
    expect((await openShare(stack, id, { timeoutSec: 901 })).status).toBe(400);
    // Without matter.devices.commission neither opening nor closing is allowed.
    expect((await openShare(stack, id, {}, ADMIN_ONLY)).status).toBe(403);
    expect((await closeShare(stack, id, ADMIN_ONLY)).status).toBe(403);

    for (const timeoutSec of [180, 900]) {
      const opened = await openShare(stack, id, { timeoutSec });
      expect(opened.status).toBe(200);
      const expiresIn = (new Date(opened.body.expiresAt).getTime() - Date.now()) / 1000;
      expect(expiresIn).toBeGreaterThan(timeoutSec - 60);
      expect(expiresIn).toBeLessThanOrEqual(timeoutSec + 5);
      const closed = await closeShare(stack, id);
      expect(closed.status).toBe(200);
      expect(closed.body).toEqual({ closed: true });
    }

    // A node that is in the fabric but not claimed here (commissioned on the sidecar alone, found by reconciliation).
    const second = await cleanup.device();
    const direct = await stack.rig.commission(second.codes.qr);
    expect(direct.state).toBe('succeeded');
    await stack.api().post('/api/matter/reconciliation').set(OPERATOR).expect(200);
    const unclaimed = await until(
      async () => (await nodeList(stack)).find((node) => node.lifecycleState === 'unclaimed'),
      60_000,
      'the unclaimed node',
    );
    // It is in the fabric, so it can be shared like a claimed node.
    const unclaimedShare = await openShare(stack, unclaimed.id);
    expect(unclaimedShare.status).toBe(200);
    expect((await closeShare(stack, unclaimed.id)).body).toEqual({ closed: true });

    // A removed node is no longer in the fabric: there is nothing to share or close.
    const removed = await stack
      .api()
      .post(`/api/matter/nodes/${id}/remove`)
      .set(COMMISSIONER)
      .send({ mode: 'normal', confirm: true });
    expect(removed.status).toBe(200);
    const removedShare = await openShare(stack, id);
    expect(removedShare.status).toBe(409);
    expect(removedShare.body.code).toBe('not_shareable');
    const removedClose = await closeShare(stack, id);
    expect(removedClose.status).toBe(409);
    expect(removedClose.body.code).toBe('not_shareable');
    expect(auditActions(stack).filter((action) => action === 'matter.node_shared')).toHaveLength(3);
  }, 300_000);
});
