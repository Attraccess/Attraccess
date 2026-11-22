// Interrupted commissioning: the sidecar stops, or the plugin restarts, while a session runs. The session ends as
// `interrupted` and is audited; nothing pretends to resume; a new session with the same code succeeds. The device
// starts only after the first attempt so that the attempt is certain to be mid-flight (still discovering).
import {
  randomCommissioningCredentials,
  setupCodesFor,
  startVirtualDevice,
} from '../../../matter-sidecar/src/testing/virtual-device';
import { freeUdpPort } from '../../../matter-sidecar/src/testing/ports';
import {
  Cleanup,
  COMMISSIONER,
  TEST_PAA,
  auditActions,
  commission,
  everythingStored,
  expectNoSecrets,
  loopbackMdns,
  nodeList,
  settle,
  startSession,
  until,
} from './commissioning.test-utils';

const SLOW_DISCOVERY = { commissioning: { ...TEST_PAA.commissioning, discoveryTimeoutMs: 120_000 } };

describe('interrupted commissioning', () => {
  const mdns = loopbackMdns();
  const cleanup = new Cleanup();
  beforeAll(() => mdns.start());
  afterAll(() => mdns.stop());
  afterEach(() => cleanup.all());

  async function laterDevice() {
    const credentials = randomCommissioningCredentials();
    const codes = setupCodesFor(credentials);
    const start = async () => {
      const device = await startVirtualDevice(cleanup.tmp(), await freeUdpPort(), credentials);
      cleanup.add(() => device.stop());
      return device;
    };
    return { codes, start };
  }

  it('ends as interrupted when the sidecar stops mid-session, audits it, and a new session with the same code succeeds', async () => {
    const later = await laterDevice();
    const stack = await cleanup.stack({ tuning: SLOW_DISCOVERY });
    const started = await startSession(stack, later.codes.qr);
    expect(started.status).toBe(201);
    await until(
      async () =>
        (await stack.api().get(`/api/matter/commissioning/sessions/${started.body.id}`).set(COMMISSIONER)).body.step,
      15_000,
      'the first step',
    );

    await stack.stopSidecar();
    const interrupted = await settle(stack, started.body.id);
    expect(interrupted).toMatchObject({ state: 'interrupted', failure: { code: 'interrupted' }, nodeRecordId: null });
    expect(auditActions(stack)).toContain('matter.commissioning_interrupted');
    expect(await nodeList(stack)).toHaveLength(0);

    // Nothing resumes: the new sidecar knows no session, and the old one stays interrupted.
    await stack.restartSidecar({ tuning: SLOW_DISCOVERY });
    await until(() => stack.host.service.connection.status().state === 'connected', 30_000, 'the reconnect');
    const device = await later.start();
    expect(
      (await stack.api().get(`/api/matter/commissioning/sessions/${started.body.id}`).set(COMMISSIONER)).body.state,
    ).toBe('interrupted');

    const again = await commission(stack, later.codes.qr);
    expect(again).toMatchObject({ state: 'succeeded', failure: null });
    expect(device.fabricIds()).toContain(stack.fabricId);
    expect(await nodeList(stack)).toHaveLength(1);
    expectNoSecrets(await everythingStored(stack), device);
  }, 240_000);

  it('ends as interrupted when the plugin restarts mid-session, audits it, and a new session with the same code succeeds', async () => {
    const later = await laterDevice();
    const stack = await cleanup.stack({ tuning: SLOW_DISCOVERY });
    const started = await startSession(stack, later.codes.manual11);
    expect(started.status).toBe(201);

    await stack.restartPlugin();

    // The new plugin has no memory of the session: it is not offered, and it cannot be read.
    expect((await stack.api().get('/api/matter/commissioning/sessions/current').set(COMMISSIONER)).text).toBe('');
    await stack.api().get(`/api/matter/commissioning/sessions/${started.body.id}`).set(COMMISSIONER).expect(404);

    // The sidecar still holds the orphan: a new start cancels it, audits the interruption and then proceeds.
    const device = await later.start();
    const again = await commission(stack, later.codes.manual11);
    expect(again).toMatchObject({ state: 'succeeded', failure: null });
    expect(auditActions(stack)).toContain('matter.commissioning_interrupted');
    expect(JSON.stringify(stack.host.audit)).toContain('plugin_restart');
    expect(device.fabricIds()).toContain(stack.fabricId);
    expect(await nodeList(stack)).toHaveLength(1);
    expectNoSecrets(await everythingStored(stack), device);
  }, 240_000);
});
