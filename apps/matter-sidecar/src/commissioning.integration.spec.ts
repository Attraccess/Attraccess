import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAttestation } from './inventory/node-meta';
import { freeUdpPort } from './testing/ports';
import { startCommissioningRig, type CommissioningRig } from './testing/commissioning';
import { startSecondController, type SecondController } from './testing/second-controller';
import {
  commissionVirtualDevice,
  openSharingWindow,
  setupCodesFor,
  startVirtualDevice,
  useLoopbackMdns,
  type VirtualDevice,
} from './testing/virtual-device';

const TEST_PAA = { commissioning: { trustTestPaa: true } };

describe('commissioning through the sidecar', () => {
  let restoreMdns: () => void;
  beforeAll(() => (restoreMdns = useLoopbackMdns()));
  afterAll(() => restoreMdns());

  const stoppers: (() => Promise<unknown>)[] = [];
  const directories: string[] = [];
  const tmp = () => {
    const directory = mkdtempSync(join(tmpdir(), 'matter-comm-'));
    directories.push(directory);
    return directory;
  };
  afterEach(async () => {
    for (const stop of stoppers.splice(0).reverse()) await stop().catch(() => undefined);
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  async function device(): Promise<VirtualDevice> {
    const started = await startVirtualDevice(tmp(), await freeUdpPort());
    stoppers.push(() => started.stop());
    return started;
  }
  async function rig(options: Parameters<typeof startCommissioningRig>[0] = {}): Promise<CommissioningRig> {
    const started = await startCommissioningRig({ ...options, config: { storageDir: tmp(), ...options.config } });
    stoppers.push(() => started.stop());
    return started;
  }
  async function second(): Promise<SecondController> {
    const started = await startSecondController();
    stoppers.push(() => started.stop());
    return started;
  }
  const layoutOf = (running: CommissioningRig) => {
    const manager = running.platform().fabric;
    if (!manager) throw new Error('no fabric manager');
    return manager.layout;
  };
  const generation = async (running: CommissioningRig) =>
    (await running.call('GET', '/v1/fabric')).body.fabricGeneration;

  describe.each([
    ['the QR payload', (codes: VirtualDevice['codes']) => codes.qr],
    ['the 11-digit manual code', (codes: VirtualDevice['codes']) => codes.manual11],
    ['the 21-digit manual code', (codes: VirtualDevice['codes']) => codes.manual21],
  ])('with %s', (_name, pick) => {
    it('joins the fabric, reports each step and records the change once', async () => {
      const light = await device();
      const running = await rig({ tuning: TEST_PAA });
      const before = await generation(running);
      const code = pick(light.codes);

      const session = await running.commission(code);

      expect(session).toMatchObject({
        state: 'succeeded',
        step: 'completed',
        outcome: 'reported',
        failure: null,
        attestation: { status: 'verified' },
        attestationOverrideAllowed: false,
      });
      expect(session.nodeId).toMatch(/^[0-9]+$/);
      const fabricId = (await running.call('GET', '/v1/fabric')).body.fabricId;
      expect(light.fabricIds()).toContain(fabricId);
      expect(readAttestation(layoutOf(running), session.nodeId as string).status).toBe('verified');
      // The change bumps the generation exactly once and is announced.
      expect(await generation(running)).toBe(before + 1);
      expect(running.events.filter((event) => event.type === 'fabric.changed').at(-1)?.payload).toMatchObject({
        fabricGeneration: before + 1,
      });
      const progress = running.events.filter((event) => event.type === 'commissioning.progress');
      const steps = progress.map((event) => (event.payload as { step: string | null }).step);
      expect(steps).toEqual(expect.arrayContaining(['discovering', 'pase', 'reading_device', 'attestation']));
      expect(steps.indexOf('attestation')).toBeLessThan(steps.indexOf('adding_fabric'));
      expect(steps.at(-1)).toBe('completed');

      // The code never reaches a log, an event, the session or an error body.
      const everything = JSON.stringify([running.logs, running.events, session]);
      for (const secret of Object.values(light.codes)) expect(everything).not.toContain(secret);
      expect(everything).not.toMatch(/MT:[A-Z0-9.-]{10,}/);
      expect(everything).not.toContain(String(light.passcode).padStart(8, '0'));
    }, 120_000);
  });

  it('refuses a code with a wrong check digit without starting anything', async () => {
    const running = await rig();
    const before = await generation(running);
    const session = await running.commission('12345678901');
    expect(session).toMatchObject({ state: 'failed', failure: { code: 'invalid_code' } });
    expect(await generation(running)).toBe(before);
    // Nothing was started, so the gate is free for the next attempt.
    const next = await running.call('POST', '/v1/commissioning/sessions', { setupCode: '12345678901' });
    expect(next.status).toBe(200);
  });

  it('reports a wrong passcode as pase_failed and leaves the device alone', async () => {
    const light = await device();
    const running = await rig({ tuning: TEST_PAA });
    const wrong = setupCodesFor({
      passcode: light.passcode === 20202021 ? 20202022 : 20202021,
      discriminator: light.discriminator,
    });
    const session = await running.commission(wrong.manual11);
    expect(session).toMatchObject({ state: 'failed', failure: { code: 'pase_failed' } });
    expect(light.fabricIds()).toEqual([]);
    // The right code still works afterwards.
    expect((await running.commission(light.codes.manual11)).state).toBe('succeeded');
  }, 120_000);

  it('reports a device that is not on the network as device_not_found', async () => {
    const running = await rig({ tuning: { commissioning: { trustTestPaa: true, discoveryTimeoutMs: 3_000 } } });
    const absent = setupCodesFor({ passcode: 34970112, discriminator: 3001 });
    const session = await running.commission(absent.qr);
    expect(session).toMatchObject({ state: 'failed', failure: { code: 'device_not_found' } });
  }, 60_000);

  describe('attestation', () => {
    it('fails strictly under the production policy and names the findings by type only', async () => {
      const light = await device();
      const running = await rig();
      const session = await running.commission(light.codes.qr);
      expect(session).toMatchObject({
        state: 'failed',
        failure: { code: 'attestation_failed', attestationFindings: expect.arrayContaining(['PaaNotTrusted']) },
        attestation: { status: 'failed', findings: expect.arrayContaining(['PaaNotTrusted']) },
      });
      expect(light.fabricIds()).toEqual([]);
      expect(await generation(running)).toBe(1);
    }, 120_000);

    it('refuses the override while the sidecar flag is off', async () => {
      const running = await rig();
      const refused = await running.call('POST', '/v1/commissioning/sessions', {
        setupCode: '34970112332',
        attestationOverride: { confirmed: true },
      });
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe('attestation_override_disabled');
      expect(running.events.filter((event) => event.type === 'commissioning.progress')).toEqual([]);
    });

    it('accepts a confirmed override only on a sidecar that enables it, and records it as unverified', async () => {
      const light = await device();
      const running = await rig({ config: { allowAttestationOverride: true } });
      expect(running.logs.join('\n')).toContain('the attestation override is enabled');

      const withoutOverride = await running.commission(light.codes.qr);
      expect(withoutOverride).toMatchObject({ state: 'failed', attestationOverrideAllowed: true });
      expect(withoutOverride.failure?.code).toBe('attestation_failed');

      const session = await running.commission(light.codes.qr, { attestationOverride: { confirmed: true } });
      expect(session).toMatchObject({
        state: 'succeeded',
        attestation: { status: 'overridden', findings: expect.arrayContaining(['PaaNotTrusted']) },
      });
      const fabricId = (await running.call('GET', '/v1/fabric')).body.fabricId;
      expect(readAttestation(layoutOf(running), session.nodeId as string).status).toBe('unverified');
      expect(light.fabricIds()).toContain(fabricId);
    }, 120_000);
  });

  describe('multi-admin', () => {
    it('joins a device through a sharing code and lists both fabrics afterwards', async () => {
      const light = await device();
      const other = await second();
      const otherNodeId = await commissionVirtualDevice(other.controller, light);
      expect(light.fabricIds()).toEqual([other.fabricId]);
      const sharing = await openSharingWindow(other.controller, otherNodeId);
      const running = await rig({ tuning: TEST_PAA });

      const session = await running.commission(sharing.manual);

      expect(session.state).toBe('succeeded');
      const fabricId = (await running.call('GET', '/v1/fabric')).body.fabricId;
      expect(light.fabricIds().sort()).toEqual([other.fabricId, fabricId].sort());
    }, 120_000);

    it('also accepts the sharing QR payload', async () => {
      const light = await device();
      const other = await second();
      const sharing = await openSharingWindow(other.controller, await commissionVirtualDevice(other.controller, light));
      const running = await rig({ tuning: TEST_PAA });
      expect((await running.commission(sharing.qr)).state).toBe('succeeded');
    }, 120_000);

    it('stops with already_commissioned and the node ID when the device is already in this fabric', async () => {
      const light = await device();
      const running = await rig({ tuning: TEST_PAA });
      const first = await running.commission(light.codes.qr);
      expect(first.state).toBe('succeeded');
      const controller = running.platform().fabric?.controller;
      if (!controller) throw new Error('no controller');
      const reopened = await openSharingWindow(controller, first.nodeId as string);
      const before = await generation(running);

      const again = await running.commission(reopened.manual);

      expect(again).toMatchObject({
        state: 'failed',
        failure: { code: 'already_commissioned', existingNodeId: first.nodeId },
      });
      expect(await generation(running)).toBe(before);
      expect(light.fabricIds()).toHaveLength(1);
    }, 120_000);
  });

  describe('one operation at a time', () => {
    it('answers busy to a second start and to a snapshot while a session runs, and cancels cleanly', async () => {
      const running = await rig({ tuning: { commissioning: { trustTestPaa: true, discoveryTimeoutMs: 60_000 } } });
      const absent = setupCodesFor({ passcode: 34970112, discriminator: 3002 });
      const started = await running.call('POST', '/v1/commissioning/sessions', { setupCode: absent.qr });
      expect(started.status).toBe(200);
      expect(started.body).toMatchObject({ state: 'running', step: 'discovering' });

      const second = await running.call('POST', '/v1/commissioning/sessions', { setupCode: absent.qr });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('busy');
      const snapshot = await running.call('POST', '/v1/backup/snapshot', {});
      expect(snapshot.status).toBe(409);
      expect(snapshot.body.error.code).toBe('busy');

      const cancelled = await running.call('DELETE', `/v1/commissioning/sessions/${started.body.sessionId}`);
      expect(cancelled.status).toBe(200);
      const finished = await running.waitFor(started.body.sessionId, 10_000);
      expect(finished).toMatchObject({ state: 'failed', failure: { code: 'cancelled' } });
      // The gate is free again.
      expect((await running.call('POST', '/v1/backup/snapshot', {})).status).toBe(200);
    }, 120_000);

    it('ends a session at its overall deadline with timeout', async () => {
      const running = await rig({
        tuning: { commissioning: { trustTestPaa: true, discoveryTimeoutMs: 60_000, deadlineMs: 1_500 } },
      });
      const absent = setupCodesFor({ passcode: 34970112, discriminator: 3003 });
      expect(await running.commission(absent.qr)).toMatchObject({ state: 'failed', failure: { code: 'timeout' } });
    }, 60_000);
  });

  it('knows no session after a restart, so the plugin sees not_found', async () => {
    const running = await rig();
    expect((await running.call('GET', '/v1/commissioning/sessions/3b241101-e2bb-4255-8caf-4136c566a962')).status).toBe(
      404,
    );
  });

  it('keeps the DCL cache outside the fabric storage that backups snapshot', async () => {
    const light = await device();
    const storageDir = tmp();
    const running = await rig({ config: { storageDir }, tuning: TEST_PAA });
    await running.commission(light.codes.qr);
    expect(readdirSync(storageDir)).toContain('dcl-cache');
    expect(readdirSync(join(storageDir, 'matter'))).not.toContain('dcl-cache');
    const snapshot = await running.call('POST', '/v1/backup/snapshot', {});
    expect(snapshot.status).toBe(200);
  }, 120_000);
});
