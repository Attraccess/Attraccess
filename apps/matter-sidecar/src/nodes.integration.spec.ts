import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMatterPlatform, type MatterPlatform } from './matter-platform';
import { expectOk } from './testing/expect-ok';
import { http, startSidecar, validHeaders, type JsonBody, type Running } from './testing/harness';
import { freeUdpPort } from './testing/ports';
import { startSecondController, type SecondController } from './testing/second-controller';
import {
  commissionVirtualDevice,
  startVirtualDevice,
  useLoopbackMdns,
  type VirtualDevice,
} from './testing/virtual-device';

/** DELETE carries a body here, and Node frames one only when `content-length` says so. */
const call = (running: Running, method: string, path: string, body?: unknown) => {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return http(running.port, method, path, {
    headers: {
      ...validHeaders(),
      'content-type': 'application/json',
      ...(payload === undefined ? {} : { 'content-length': String(Buffer.byteLength(payload)) }),
    },
    body: payload,
  });
};

// The device, the sidecar's controller and a second controller ("another ecosystem") run in this process and find each
// other over mDNS on the loopback interface.
describe('inventory, removal and sharing (real matter.js controller and virtual device)', () => {
  let restoreMdns: () => void;
  beforeAll(() => {
    restoreMdns = useLoopbackMdns();
  });
  afterAll(() => restoreMdns());

  const directories: string[] = [];
  const stoppers: (() => Promise<unknown>)[] = [];
  const tmp = () => {
    const directory = mkdtempSync(join(tmpdir(), 'matter-nodes-'));
    directories.push(directory);
    return directory;
  };
  afterEach(async () => {
    for (const stop of stoppers.splice(0).reverse()) await stop().catch(() => undefined);
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  /** A sidecar with a fabric and one commissioned virtual light. */
  async function setup() {
    const changes: JsonBody[] = [];
    let platform: MatterPlatform | undefined;
    const sidecar = await startSidecar(
      { storageDir: tmp() },
      {
        loadPlatform: async (context) =>
          (platform = await loadMatterPlatform({
            ...context,
            onFabricChanged: (payload) => {
              changes.push(payload);
              context.onFabricChanged(payload);
            },
          })),
      },
    );
    stoppers.push(() => sidecar.stop());
    const device: VirtualDevice = await startVirtualDevice(tmp(), await freeUdpPort());
    stoppers.push(() => device.stop());
    const fabric = expectOk(
      sidecar,
      'POST /v1/fabric',
      await call(sidecar, 'POST', '/v1/fabric', { label: 'Attraccess' }),
    );
    const controller = platform?.fabric?.controller;
    if (!controller) throw new Error('the controller is not running');
    const nodeId = await commissionVirtualDevice(controller, device);
    return { sidecar, device, fabric, nodeId, changes, platform: platform as MatterPlatform };
  }
  const other = async (): Promise<SecondController> => {
    const controller = await startSecondController();
    stoppers.push(() => controller.stop());
    return controller;
  };

  it('reports an empty authoritative inventory without a fabric and lists both new families as available', async () => {
    const sidecar = await startSidecar(
      { storageDir: tmp() },
      { loadPlatform: (context) => loadMatterPlatform(context) },
    );
    stoppers.push(() => sidecar.stop());
    expect((await call(sidecar, 'GET', '/v1/nodes')).body).toEqual({ authoritative: true, fabricId: null, nodes: [] });
    const families = (await call(sidecar, 'GET', '/v1/capabilities')).body.capabilities;
    const available = (family: string) => families.find((entry: JsonBody) => entry.family === family).available;
    expect(available('inventory')).toBe(true);
    expect(available('commissioning')).toBe(true);
  });

  it('lists a commissioned node with identity, endpoints, clusters and its own administrator entry', async () => {
    const { sidecar, fabric, nodeId, device } = await setup();
    const list = (await call(sidecar, 'GET', '/v1/nodes')).body;
    expect(list).toMatchObject({ authoritative: true, fabricId: fabric.fabricId });
    expect(list.nodes).toHaveLength(1);
    const node = (await call(sidecar, 'GET', `/v1/nodes/${nodeId}`)).body;
    expect(node).toMatchObject({
      nodeId,
      reachable: true,
      vendorId: 0xfff1,
      productId: 0x8000,
      vendorName: 'Attraccess tests',
      productName: 'Virtual light',
      serialNumber: 'virtual-1',
      softwareVersion: 1,
      attestation: { status: 'unknown', checkedAt: null },
    });
    expect(node.observedAt).toEqual(expect.any(String));
    const root = node.endpoints.find((endpoint: JsonBody) => endpoint.endpointId === 0);
    const light = node.endpoints.find((endpoint: JsonBody) => endpoint.endpointId === 1);
    expect(root.parentEndpointId).toBeNull();
    expect(light).toMatchObject({
      parentEndpointId: 0,
      bridged: null,
      deviceTypes: [{ deviceTypeId: 256, revision: 4 }],
    });
    const onOff = light.clusters.find((cluster: JsonBody) => cluster.clusterId === 6);
    expect(onOff).toMatchObject({ role: 'server', revision: 6, featureMap: 1 });
    expect(onOff.attributeIds).toContain(0);
    expect(onOff.acceptedCommandIds).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(node.administrators).toEqual([{ fabricIndex: 1, vendorId: 0xfff1, fabricLabel: 'Attraccess', isOwn: true }]);
    expect(device.fabricIds()).toContain(fabric.fabricId);
    expect((await call(sidecar, 'GET', '/v1/nodes/9999')).status).toBe(404);
  }, 120_000);

  it('shares a node: the second controller joins with the code, the device lists both fabrics, the code is never logged', async () => {
    const { sidecar, device, fabric, nodeId, changes } = await setup();
    const second = await other();
    const before = changes.length;
    const opened = await call(sidecar, 'POST', `/v1/nodes/${nodeId}/commissioning-window`, { timeoutSec: 180 });
    expect(opened.status).toBe(200);
    expect(opened.body.manualCode).toMatch(/^[0-9]{11}$/);
    expect(opened.body.qrCode).toMatch(/^MT:/);
    expect(new Date(opened.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 170_000);
    await second.commissionWithCode(opened.body.manualCode);
    expect(device.fabricIds().sort()).toEqual([fabric.fabricId, second.fabricId].sort());
    const node = (await call(sidecar, 'GET', `/v1/nodes/${nodeId}`)).body;
    expect(node.administrators).toHaveLength(2);
    expect(node.administrators.filter((entry: JsonBody) => entry.isOwn)).toHaveLength(1);
    // Sharing does not change Attraccess's own fabric.
    expect(changes).toHaveLength(before);
    const logs = (sidecar as Running).logs.join('\n');
    for (const secret of [opened.body.manualCode, opened.body.qrCode]) expect(logs).not.toContain(secret);
    expect(JSON.stringify(sidecar.sidecar.stream)).not.toContain(opened.body.manualCode);
  }, 120_000);

  it('closes a sharing window, and says so when none is open', async () => {
    const { sidecar, nodeId } = await setup();
    await call(sidecar, 'POST', `/v1/nodes/${nodeId}/commissioning-window`, {});
    expect((await call(sidecar, 'DELETE', `/v1/nodes/${nodeId}/commissioning-window`, {})).body).toEqual({
      nodeId,
      closed: true,
    });
    expect((await call(sidecar, 'DELETE', `/v1/nodes/${nodeId}/commissioning-window`, {})).body).toEqual({
      nodeId,
      closed: false,
    });
    expect((await call(sidecar, 'POST', `/v1/nodes/${nodeId}/commissioning-window`, { timeoutSec: 60 })).status).toBe(
      400,
    );
  }, 120_000);

  it('removes a node normally: RemoveFabric for our fabric only, generation bumped, fabric.changed published', async () => {
    const { sidecar, device, fabric, nodeId, changes } = await setup();
    const second = await other();
    const opened = await call(sidecar, 'POST', `/v1/nodes/${nodeId}/commissioning-window`, {});
    await second.commissionWithCode(opened.body.manualCode);
    const generation = (await call(sidecar, 'GET', '/v1/fabric')).body.fabricGeneration;
    const before = changes.length;

    const removed = await call(sidecar, 'DELETE', `/v1/nodes/${nodeId}`, { force: false });
    expect(removed.body).toEqual({ nodeId, result: 'removed_from_fabric', fabricGeneration: generation + 1 });
    expect(device.fabricIds()).toEqual([second.fabricId]);
    expect(device.fabricIds()).not.toContain(fabric.fabricId);
    expect((await call(sidecar, 'GET', '/v1/nodes')).body.nodes).toEqual([]);
    expect((await call(sidecar, 'GET', `/v1/nodes/${nodeId}`)).status).toBe(404);
    expect((await call(sidecar, 'GET', '/v1/fabric')).body.fabricGeneration).toBe(generation + 1);
    expect(changes.slice(before)).toEqual([
      { fabricGeneration: generation + 1, fabricId: fabric.fabricId, state: 'initialized' },
    ]);
  }, 120_000);

  it('refuses a normal removal of an unreachable device and changes nothing; a forced removal works', async () => {
    const { sidecar, device, fabric, nodeId, changes } = await setup();
    const generation = (await call(sidecar, 'GET', '/v1/fabric')).body.fabricGeneration;
    const before = changes.length;
    await device.stop();

    const refused = await call(sidecar, 'DELETE', `/v1/nodes/${nodeId}`, { force: false });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('device_unreachable');
    expect((await call(sidecar, 'GET', '/v1/nodes')).body.nodes).toHaveLength(1);
    expect((await call(sidecar, 'GET', '/v1/fabric')).body.fabricGeneration).toBe(generation);
    expect(changes).toHaveLength(before);

    const forced = await call(sidecar, 'DELETE', `/v1/nodes/${nodeId}`, { force: true });
    expect(forced.body).toEqual({ nodeId, result: 'forgotten', fabricGeneration: generation + 1 });
    expect((await call(sidecar, 'GET', '/v1/nodes')).body.nodes).toEqual([]);
    expect(changes.slice(before)).toEqual([
      { fabricGeneration: generation + 1, fabricId: fabric.fabricId, state: 'initialized' },
    ]);
    expect((await call(sidecar, 'DELETE', `/v1/nodes/${nodeId}`, { force: true })).status).toBe(404);
  }, 180_000);

  it('runs removal and sharing through the single-flight gate: snapshot, removal and sharing get busy meanwhile', async () => {
    const { sidecar, nodeId, platform } = await setup();
    let release: () => void = () => undefined;
    const held = platform.fabric?.runExclusive(() => new Promise<void>((resolve) => (release = resolve)));
    try {
      expect((await call(sidecar, 'POST', '/v1/backup/snapshot', {})).body.error.code).toBe('busy');
      expect((await call(sidecar, 'DELETE', `/v1/nodes/${nodeId}`, { force: true })).body.error.code).toBe('busy');
      expect((await call(sidecar, 'POST', `/v1/nodes/${nodeId}/commissioning-window`, {})).body.error.code).toBe(
        'busy',
      );
      expect((await call(sidecar, 'DELETE', `/v1/nodes/${nodeId}/commissioning-window`, {})).body.error.code).toBe(
        'busy',
      );
    } finally {
      release();
      await held;
    }
    expect((await call(sidecar, 'GET', '/v1/nodes')).body.nodes).toHaveLength(1);
  }, 120_000);
});
