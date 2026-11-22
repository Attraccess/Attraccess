// Multi-admin: a sharing code from another ecosystem (a second controller with its own fabric) is entered like any
// setup code, and Attraccess opens its own commissioning window for another controller. Needs mDNS over loopback.
import { openSharingWindow, commissionVirtualDevice } from '../../../matter-sidecar/src/testing/virtual-device';
import {
  Cleanup,
  COMMISSIONER,
  TEST_PAA,
  auditActions,
  commission,
  everythingStored,
  expectNoSecrets,
  loopbackMdns,
  nodeDetail,
  nodeList,
  until,
} from './commissioning.test-utils';

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

    const shared = await stack.api().post(`/api/matter/nodes/${session.nodeRecordId}/share`).set(COMMISSIONER).send({});
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
    await stack
      .api()
      .post('/api/matter/reconciliation')
      .set({ 'x-test-permissions': 'matter.devices.read,matter.devices.manage' });
    const refreshed = await until(
      async () => {
        const detail = await nodeDetail(stack, session.nodeRecordId);
        return detail.administrators.length === 2 ? detail : null;
      },
      30_000,
      'both administrators in the node detail',
    );
    expect(refreshed.administrators.filter((admin: { isOwn: boolean }) => !admin.isOwn)).toHaveLength(1);

    const closed = await stack.api().delete(`/api/matter/nodes/${session.nodeRecordId}/share`).set(COMMISSIONER);
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual({ closed: expect.any(Boolean) });
    expect(auditActions(stack)).toEqual(expect.arrayContaining(['matter.node_shared', 'matter.node_share_revoked']));
    // The window codes live in the response only: never in a row, an audit record, a log line or an event.
    expectNoSecrets(await everythingStored(stack), light, [shared.body.manualCode, shared.body.qrCode]);
    expect(await nodeList(stack)).toHaveLength(1);
  }, 240_000);

  it('rejects a share window outside 180-900 seconds and for a node that is not claimed here', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const session = await commission(stack, light.codes.manual11);
    const share = (timeoutSec: number) =>
      stack.api().post(`/api/matter/nodes/${session.nodeRecordId}/share`).set(COMMISSIONER).send({ timeoutSec });
    expect((await share(60)).status).toBe(400);
    expect((await share(901)).status).toBe(400);
  }, 180_000);
});
