// Commissioning through the plugin's HTTP API, end to end: the real sidecar and matter.js controller, the plugin in a
// Nest host, and a virtual matter.js light. Needs mDNS over loopback. Covers each input form, the naming step, the
// failure paths (invalid code, wrong passcode, not found), duplicates and the one-at-a-time rule.
import {
  openSharingWindow,
  setupCodesFor,
  type VirtualDevice,
} from '../../../matter-sidecar/src/testing/virtual-device';
import { MatterFabricGuard } from '../backend/fabric/guard';
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
  settle,
  startSession,
  storedBackups,
  until,
} from './commissioning.test-utils';

describe('commissioning through the plugin API', () => {
  const mdns = loopbackMdns();
  const cleanup = new Cleanup();
  beforeAll(() => mdns.start());
  afterAll(() => mdns.stop());
  afterEach(() => cleanup.all());

  describe.each([
    ['the QR payload', (codes: VirtualDevice['codes']) => codes.qr],
    ['the 11-digit manual code', (codes: VirtualDevice['codes']) => codes.manual11],
    ['the 21-digit manual code', (codes: VirtualDevice['codes']) => codes.manual21],
  ])('with %s', (_name, pick) => {
    it('registers a node claimed by the commissioning user, with its endpoints, audited, without any secret stored', async () => {
      const light = await cleanup.device();
      const stack = await cleanup.stack({ tuning: TEST_PAA });

      const session = await commission(stack, pick(light.codes));

      expect(session).toMatchObject({
        state: 'succeeded',
        step: 'completed',
        failure: null,
        attestation: { status: 'verified' },
        overrideAvailable: false,
        finished: false,
      });
      expect(session.nodeRecordId).toEqual(expect.any(String));
      expect(session.endpoints.length).toBeGreaterThan(0);
      expect(light.fabricIds()).toContain(stack.fabricId);

      const detail = await nodeDetail(stack, session.nodeRecordId);
      expect(detail).toMatchObject({
        lifecycleState: 'claimed',
        claimedBy: 7,
        detachedReason: null,
        attestationOverridden: false,
        identity: { vendorName: 'Attraccess tests', attestation: { status: 'verified' } },
      });
      expect(detail.endpoints.length).toBeGreaterThan(0);
      expect(detail.administrators).toEqual([expect.objectContaining({ isOwn: true })]);
      expect(await nodeList(stack)).toHaveLength(1);
      expect(auditActions(stack)).toEqual(
        expect.arrayContaining(['matter.commissioning_started', 'matter.node_commissioned']),
      );
      // The plugin recorded its own generation change: no mismatch, and the session is still readable.
      expect((await stack.api().get('/api/matter/fabric').set(ADMIN_ONLY).expect(200)).body.sidecar).toMatchObject({
        state: 'initialized',
        fabricGeneration: 2,
      });
      expect(stack.host.logs.join('\n')).not.toMatch(/mismatch/i);
      expectNoSecrets(await everythingStored(stack), light);
    }, 180_000);
  });

  it('takes a fabric_changed backup after the commissioning and names the node in the naming step', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const session = await commission(stack, light.codes.qr);
    expect(session.state).toBe('succeeded');

    // The returning user finds the session again, then names the node. A commission-only user may do that.
    const current = (await stack.api().get('/api/matter/commissioning/sessions/current').set(COMMISSIONER)).body;
    expect(current).toMatchObject({ id: session.id, state: 'succeeded' });
    const finished = await stack
      .api()
      .post(`/api/matter/commissioning/sessions/${session.id}/finish`)
      .set(COMMISSIONER)
      .send({
        displayName: 'Workshop light',
        location: 'Workshop',
        endpoints: [{ id: session.endpoints[0].id, displayName: 'Main light' }],
      })
      .expect(200);
    expect(finished.body.node.metadata).toMatchObject({ displayName: 'Workshop light', location: 'Workshop' });
    await stack
      .api()
      .post(`/api/matter/commissioning/sessions/${session.id}/finish`)
      .set(COMMISSIONER)
      .send({})
      .expect(409);
    // A null body is an empty response.
    expect((await stack.api().get('/api/matter/commissioning/sessions/current').set(COMMISSIONER)).text).toBe('');
    expect(auditActions(stack)).toContain('matter.commissioning_finished');
    const detail = await nodeDetail(stack, session.nodeRecordId);
    expect(detail.endpoints.find((entry: { id: string }) => entry.id === session.endpoints[0].id)).toMatchObject({
      metadata: { displayName: 'Main light' },
    });

    // The change moved the generation: the debounced scheduler takes the backup on its own (default debounce 30 s).
    const backup = await until(
      async () => (await storedBackups(stack)).find((entry) => entry.trigger === 'fabric_changed'),
      90_000,
      'the fabric_changed backup',
    );
    expect(backup.fabricGeneration).toBeGreaterThanOrEqual(2);
  }, 240_000);

  it('refuses a malformed code in the request body without echoing it, and starts nothing', async () => {
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const refused = await startSession(stack, '12345');
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).not.toContain('12345');
    // A well-formed code with a wrong check digit fails inside the session, before any device contact.
    const session = await commission(stack, '12345678901');
    expect(session).toMatchObject({ state: 'failed', failure: { code: 'invalid_code' } });
    expect(await nodeList(stack)).toHaveLength(0);
    expect(auditActions(stack)).toContain('matter.commissioning_failed');
  }, 120_000);

  it('reports a wrong passcode and an absent device explicitly, audits them and registers nothing', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({
      tuning: { commissioning: { ...TEST_PAA.commissioning, discoveryTimeoutMs: 4_000 } },
    });
    const wrong = setupCodesFor({
      passcode: light.passcode === 20202021 ? 20202022 : 20202021,
      discriminator: light.discriminator,
    });
    const refused = await commission(stack, wrong.manual11);
    expect(refused).toMatchObject({ state: 'failed', failure: { code: 'pase_failed' } });
    expect(light.fabricIds()).toEqual([]);

    const absent = await commission(stack, setupCodesFor({ passcode: 34970112, discriminator: 3001 }).qr);
    expect(absent).toMatchObject({ state: 'failed', failure: { code: 'device_not_found' } });
    expect(await nodeList(stack)).toHaveLength(0);
    expect(auditActions(stack).filter((action) => action === 'matter.commissioning_failed')).toHaveLength(2);

    // The right code still works afterwards.
    expect((await commission(stack, light.codes.manual11)).state).toBe('succeeded');
  }, 240_000);

  it('answers 409 busy to a second start, cancels the first one and frees the gate', async () => {
    const stack = await cleanup.stack({
      tuning: { commissioning: { ...TEST_PAA.commissioning, discoveryTimeoutMs: 60_000 } },
    });
    const absent = setupCodesFor({ passcode: 34970112, discriminator: 3002 });
    const first = await startSession(stack, absent.qr);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ state: expect.stringMatching(/pending|running/) });

    const second = await startSession(stack, absent.manual11);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('busy');
    // The sidecar's own gate also refuses a snapshot while the session holds it.
    const snapshot = await stack.rig.call('POST', '/v1/backup/snapshot', {});
    expect(snapshot.body.error.code).toBe('busy');

    await stack.api().delete(`/api/matter/commissioning/sessions/${first.body.id}`).set(COMMISSIONER).expect(200);
    const ended = await settle(stack, first.body.id);
    expect(ended).toMatchObject({ state: 'failed', failure: { code: 'cancelled' } });
    expect(auditActions(stack)).toContain('matter.commissioning_cancelled');
    expect((await stack.rig.call('POST', '/v1/backup/snapshot', {})).status).toBe(200);
  }, 120_000);

  it('answers already_commissioned with the existing node and creates no second record', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const first = await commission(stack, light.codes.qr);
    expect(first.state).toBe('succeeded');

    // Re-open the window on the sidecar's own controller, as the device would offer after a factory-reset-less re-pair.
    const controller = stack.rig.platform().fabric?.controller;
    if (!controller) throw new Error('no controller');
    const nodeId = (await nodeDetail(stack, first.nodeRecordId)).nodeId;
    const reopened = await openSharingWindow(controller, nodeId);

    const again = await commission(stack, reopened.manual);
    expect(again).toMatchObject({
      state: 'failed',
      failure: { code: 'already_commissioned', existing: { nodeRecordId: first.nodeRecordId, action: 'open' } },
    });
    expect(await nodeList(stack)).toHaveLength(1);
    expect(light.fabricIds()).toHaveLength(1);
    expectNoSecrets(await everythingStored(stack), light, [reopened.manual, reopened.qr]);
  }, 240_000);

  it('keeps the record-only force-remove working', async () => {
    const light = await cleanup.device();
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const session = await commission(stack, light.codes.manual11);
    await stack
      .api()
      .post(`/api/matter/nodes/${session.nodeRecordId}/force-remove`)
      .set(OPERATOR)
      .send({ confirm: true })
      .expect(200);
    expect(await nodeDetail(stack, session.nodeRecordId)).toMatchObject({
      lifecycleState: 'removed',
      removalReason: 'force_removed',
    });
  }, 180_000);

  it('answers 409 recovery_required for every fabric mutation while the guard blocks them', async () => {
    const stack = await cleanup.stack({ tuning: TEST_PAA });
    const guard = stack.host.app.get(MatterFabricGuard);
    guard.set('sidecar_recovery_required');
    const started = await startSession(stack, '34970112332');
    expect(started.status).toBe(409);
    expect(started.body.code).toBe('recovery_required');
    const id = '3b241101-e2bb-4255-8caf-4136c566a962';
    const removed = await stack
      .api()
      .post(`/api/matter/nodes/${id}/remove`)
      .set(COMMISSIONER)
      .send({ mode: 'normal', confirm: true });
    expect(removed.status).toBe(409);
    expect((await stack.api().post(`/api/matter/nodes/${id}/share`).set(COMMISSIONER).send({})).status).toBe(409);
  }, 120_000);
});
