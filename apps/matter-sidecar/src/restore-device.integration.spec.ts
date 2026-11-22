import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMatterPlatform, type MatterPlatform } from './matter-platform';
import { freeUdpPort } from './testing/ports';
import { expectOk } from './testing/expect-ok';
import { http, startSidecar, validHeaders, type Running } from './testing/harness';
import {
  commissionVirtualDevice,
  startVirtualDevice,
  toggleDevice,
  useLoopbackMdns,
  type VirtualDevice,
} from './testing/virtual-device';

const post = (running: Running, path: string, body: unknown) =>
  http(running.port, 'POST', path, {
    headers: { ...validHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// The device and both controllers run in this process on their own storage and ports and find each other over mDNS on
// the loopback interface (see useLoopbackMdns); only the setup waits for discovery, the assertions run once.
describe('restoring a snapshot keeps a commissioned device controllable', () => {
  let restoreMdns: () => void;
  beforeAll(() => {
    restoreMdns = useLoopbackMdns();
  });
  afterAll(() => restoreMdns());

  const directories: string[] = [];
  const stoppers: (() => Promise<unknown>)[] = [];
  const tmp = () => {
    const directory = mkdtempSync(join(tmpdir(), 'matter-restore-'));
    directories.push(directory);
    return directory;
  };

  afterEach(async () => {
    for (const stop of stoppers.splice(0).reverse()) await stop().catch(() => undefined);
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  async function startReal(storageDir: string) {
    let platform: MatterPlatform | undefined;
    const sidecar = await startSidecar(
      { storageDir },
      { loadPlatform: async (context) => (platform = await loadMatterPlatform(context)) },
    );
    stoppers.push(() => sidecar.stop());
    return { sidecar, platform: () => platform as MatterPlatform };
  }

  it('backup -> wipe -> restore on a fresh storage directory -> toggle the same device, no recommissioning', async () => {
    const device: VirtualDevice = await startVirtualDevice(tmp(), await freeUdpPort());
    stoppers.push(() => device.stop());

    const original = tmp();
    const first = await startReal(original);
    const created = expectOk(
      first.sidecar,
      'POST /v1/fabric',
      await post(first.sidecar, '/v1/fabric', { label: 'Attraccess' }),
    );
    const controller = first.platform().fabric?.controller;
    if (!controller) throw new Error('the controller is not running');
    const nodeId = await commissionVirtualDevice(controller, device);
    expect(device.fabricIds()).toContain(created.fabricId);
    expect(device.isOn()).toBe(false);
    await toggleDevice(controller, nodeId);
    expect(device.isOn()).toBe(true);

    const snapshot = expectOk(
      first.sidecar,
      'POST /v1/backup/snapshot',
      await post(first.sidecar, '/v1/backup/snapshot', {}),
    );
    expect(snapshot.header.fabricId).toBe(created.fabricId);
    await first.sidecar.stop();
    rmSync(original, { recursive: true, force: true });

    const second = await startReal(tmp());
    expect((await http(second.sidecar.port, 'GET', '/v1/fabric', { headers: validHeaders() })).body.state).toBe(
      'uninitialized',
    );
    const staged = expectOk(
      second.sidecar,
      'POST /v1/backup/restore/stage',
      await post(second.sidecar, '/v1/backup/restore/stage', snapshot),
    );
    const committed = await post(second.sidecar, '/v1/backup/restore/commit', { stageId: staged.stageId });
    expect(committed.body.fabric).toMatchObject({ state: 'initialized', fabricId: created.fabricId });
    await post(second.sidecar, '/v1/backup/restore/finalize', { stageId: staged.stageId });

    const restored = second.platform().fabric?.controller;
    if (!restored) throw new Error('the restored controller is not running');
    await toggleDevice(restored, nodeId);
    expect(device.isOn()).toBe(false);
    expect(device.fabricIds()).toContain(created.fabricId);
  }, 120_000);
});
