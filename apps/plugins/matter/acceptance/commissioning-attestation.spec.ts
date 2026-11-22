// Strict attestation under the production policy (the virtual device carries matter.js test certificates), the
// development override and its three gates, and the plugin-side write failure. Needs mDNS over loopback.
import { matterStorage } from '../backend/plugin-storage/access';
import {
  Cleanup,
  COMMISSIONER,
  OPERATOR,
  auditActions,
  commission,
  everythingStored,
  expectNoSecrets,
  loopbackMdns,
  nodeDetail,
  nodeList,
  startSession,
  TEST_PAA,
  until,
} from './commissioning.test-utils';

describe('attestation and registry agreement', () => {
  const mdns = loopbackMdns();
  const cleanup = new Cleanup();
  beforeAll(() => mdns.start());
  afterAll(() => mdns.stop());
  afterEach(() => cleanup.all());

  it('rejects the virtual device under the production policy, naming finding types only, and refuses the override', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack();

    const session = await commission(stack, light.codes.qr);

    expect(session).toMatchObject({
      state: 'failed',
      failure: { code: 'attestation_failed', attestationFindings: expect.arrayContaining(['PaaNotTrusted']) },
      attestation: { status: 'failed' },
      overrideAvailable: false,
    });
    expect(light.fabricIds()).toEqual([]);
    expect(await nodeList(stack)).toHaveLength(0);
    expect(auditActions(stack)).toContain('matter.commissioning_failed');
    expect(JSON.stringify(stack.host.audit)).toContain('PaaNotTrusted');

    // The sidecar flag is off: even a permitted, confirmed request is refused, and no session starts.
    const refused = await startSession(stack, light.codes.qr, OPERATOR, { attestationOverride: { confirmed: true } });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('attestation_override_disabled');
    expect(light.fabricIds()).toEqual([]);
    expectNoSecrets(await everythingStored(stack), light);
  }, 180_000);

  it('allows the override only with the sidecar flag, the manage permission and the confirmation, and records it as unverified', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({ config: { allowAttestationOverride: true } });
    expect(stack.rig.logs.join('\n')).toContain('the attestation override is enabled');

    const failed = await commission(stack, light.codes.qr, OPERATOR);
    expect(failed).toMatchObject({ state: 'failed', overrideAvailable: true, failure: { code: 'attestation_failed' } });

    // Without the manage permission, or without the explicit confirmation, nothing starts.
    const forbidden = await startSession(stack, light.codes.qr, COMMISSIONER, {
      attestationOverride: { confirmed: true },
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('attestation_override_forbidden');
    const unconfirmed = await startSession(stack, light.codes.qr, OPERATOR, {
      attestationOverride: { confirmed: false },
    });
    expect(unconfirmed.status).toBe(400);
    expect(light.fabricIds()).toEqual([]);

    const session = await commission(stack, light.codes.qr, OPERATOR, { attestationOverride: { confirmed: true } });
    expect(session).toMatchObject({
      state: 'succeeded',
      attestation: { status: 'overridden', findings: expect.arrayContaining(['PaaNotTrusted']) },
    });
    const detail = await nodeDetail(stack, session.nodeRecordId);
    expect(detail).toMatchObject({
      attestationOverridden: true,
      identity: { attestation: { status: 'unverified' } },
    });
    expect(auditActions(stack)).toContain('matter.commissioning_attestation_overridden');
    expect(JSON.stringify(stack.host.audit)).toContain('PaaNotTrusted');
    expectNoSecrets(await everythingStored(stack), light);
  }, 240_000);

  it('ends needs_reconciliation when the plugin cannot write, and a reconciliation then shows exactly one unclaimed node', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    // The registry claims the node, by inserting it as claimed or by claiming one reconciliation quarantined in the
    // meantime. Either write fails once: the sidecar already holds the device.
    type Table = {
      insert: (row: { lifecycleState?: string }, options?: { scope?: unknown }) => Promise<unknown>;
      update: (where: unknown, patch: { lifecycleState?: string }, options?: { scope?: unknown }) => Promise<number>;
    };
    const nodes = matterStorage(stack.host.context).tables.nodes as unknown as Table;
    const { insert, update } = nodes;
    let armed = true;
    const fail = () => {
      armed = false;
      return Promise.reject(new Error('simulated write failure'));
    };
    nodes.insert = (row, options) =>
      armed && options?.scope && row.lifecycleState === 'claimed' ? fail() : insert.call(nodes, row, options);
    nodes.update = (where, patch, options) =>
      armed && options?.scope && patch.lifecycleState === 'claimed'
        ? fail()
        : update.call(nodes, where, patch, options);

    const session = await commission(stack, light.codes.qr);

    expect(armed).toBe(false);
    expect(session).toMatchObject({
      state: 'failed',
      failure: { code: expect.stringMatching(/^(needs_reconciliation|registry_failed)$/) },
      nodeRecordId: null,
    });
    expect(light.fabricIds()).toContain(stack.fabricId);
    // Nothing half-written: the transaction rolled back.
    expect((await nodeList(stack)).filter((node) => node.lifecycleState === 'claimed')).toHaveLength(0);

    const reconcile = () => stack.api().post('/api/matter/reconciliation').set(OPERATOR).expect(200);
    await reconcile();
    const listed = await until(
      async () => {
        const nodes = await nodeList(stack);
        return nodes.length > 0 ? nodes : null;
      },
      60_000,
      'the unclaimed node',
    );
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ lifecycleState: 'unclaimed', claimedBy: null });

    // A further reconciliation finds the same node and adds no duplicate.
    await reconcile();
    const again = await nodeList(stack);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ id: listed[0].id, lifecycleState: 'unclaimed', claimedBy: null });
  }, 240_000);
});
