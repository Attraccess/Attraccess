import { SidecarRequestError } from '../client/errors';
import { createCommissioningHarness, type CommissioningHarness } from '../testing/commissioning-harness.test-utils';

const USER = { userId: 7, authenticationMethod: 'session' as const };
const MANUAL = '36217551633';
const QR = 'MT:Y.K9042C00KA0648G00';

describe('sharing a node with another controller', () => {
  let h: CommissioningHarness;
  let nodeRef: string;
  beforeEach(async () => {
    h = await createCommissioningHarness();
    h.sidecarCommissions('5');
    await h.reconciliation.request();
    nodeRef = (await h.tables.nodes.findOne())?.id as string;
    h.connection.handlers['nodes.share.open'] = () => ({
      nodeId: '5',
      manualCode: MANUAL,
      qrCode: QR,
      expiresAt: new Date(Date.now() + 180_000).toISOString(),
    });
    h.connection.handlers['nodes.share.revoke'] = () => ({ nodeId: '5', closed: true });
    h.audit.mockClear();
  });
  afterEach(() => h.close());

  it('returns the codes once and records neither them nor anything else secret', async () => {
    const result = await h.sharing.open(nodeRef, {}, USER);
    expect(result).toMatchObject({ manualCode: MANUAL, qrCode: QR });
    expect(h.connection.sent.find((entry) => entry.operation === 'nodes.share.open')?.body).toEqual({});
    expect(h.actions()).toEqual(['matter.node_shared']);
    const everything = JSON.stringify([h.emitted(), await h.tables.nodes.find(), await h.tables.fabrics.find()]);
    expect(everything).not.toContain(MANUAL);
    expect(everything).not.toContain(QR);
    expect(h.events()[0]).toMatchObject({ details: { timeoutSec: 180 }, principal: { userId: 7 } });
  });

  it('passes the chosen window to the sidecar, and closes it on request', async () => {
    await h.sharing.open(nodeRef, { timeoutSec: 600 }, USER);
    expect(h.connection.sent.find((entry) => entry.operation === 'nodes.share.open')?.body).toEqual({
      timeoutSec: 600,
    });
    await expect(h.sharing.revoke(nodeRef, USER)).resolves.toEqual({ closed: true });
    expect(h.actions()).toEqual(['matter.node_shared', 'matter.node_share_revoked']);
  });

  it('audits the expiry of the window as the system', async () => {
    h.connection.handlers['nodes.share.open'] = () => ({
      nodeId: '5',
      manualCode: MANUAL,
      qrCode: QR,
      expiresAt: new Date(Date.now() + 30).toISOString(),
    });
    await h.sharing.open(nodeRef, {}, USER);
    await h.waitFor(() => h.actions().includes('matter.node_share_expired'));
    const expired = h.audit.mock.calls.map((c) => (c as unknown as [{ action: string; principal: object }])[0]).at(-1);
    expect(expired?.principal).not.toMatchObject({ userId: 7 });
  });

  it('is guarded, single-flight, and maps an unreachable device without leaking the sidecar message', async () => {
    h.guard.set('fabric_changed');
    await expect(h.sharing.open(nodeRef, {}, USER)).rejects.toMatchObject({ response: { code: 'recovery_required' } });
    h.guard.set(null);
    const release = h.gate.enter('commissioning');
    await expect(h.sharing.open(nodeRef, {}, USER)).rejects.toMatchObject({ response: { code: 'busy' } });
    release();
    h.connection.handlers['nodes.share.open'] = () => {
      throw new SidecarRequestError(`failed for ${MANUAL}`, { code: 'device_unreachable' });
    };
    await expect(h.sharing.open(nodeRef, {}, USER)).rejects.toMatchObject({ response: { code: 'device_unreachable' } });
    expect(h.gate.busy).toBe(false);
  });

  it('only shares a node that is in the fabric', async () => {
    await h.lifecycle.forceRemove(nodeRef, USER);
    await expect(h.sharing.open(nodeRef, {}, USER)).rejects.toMatchObject({ response: { code: 'not_shareable' } });
  });
});
