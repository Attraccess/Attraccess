// Shared set-up of the commissioning acceptance tests: the real Matter sidecar (real matter.js controller, real
// storage, the test seams of `loadMatterPlatform`), the plugin in a Nest host, virtual devices and a second controller.
// Everything runs over loopback mDNS with random credentials and its own ports and directories, so the specs are
// parallel-safe. The setup codes only ever travel in request bodies.
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import {
  startCommissioningRig,
  type CommissioningRig,
  type RigOptions,
} from '../../../matter-sidecar/src/testing/commissioning';
import { TEST_TOKEN } from '../../../matter-sidecar/src/testing/config';
import { freeUdpPort } from '../../../matter-sidecar/src/testing/ports';
import { startSecondController, type SecondController } from '../../../matter-sidecar/src/testing/second-controller';
import {
  startVirtualDevice,
  useLoopbackMdns,
  type VirtualDevice,
} from '../../../matter-sidecar/src/testing/virtual-device';
import { matterStorage } from '../backend/plugin-storage/access';
import { MATTER_TABLES } from '../backend/plugin-storage/tables';
import { bootHost, type Host } from './host.test-utils';

/** A user who may commission, share and remove, but not manage the plugin. */
export const COMMISSIONER = { 'x-test-permissions': 'matter.devices.read,matter.devices.commission' };
/** The same user with `matter.devices.manage`: may also use the attestation override. */
export const OPERATOR = {
  'x-test-permissions': 'matter.devices.read,matter.devices.commission,matter.devices.manage',
};
export const ADMIN_ONLY = { 'x-test-permissions': 'matter.devices.read,matter.devices.manage' };

export const TEST_PAA = { commissioning: { trustTestPaa: true } };

export async function until<T>(
  probe: () => T | Promise<T>,
  timeoutMs = 30_000,
  describe = 'condition',
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value as NonNullable<T>;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${describe}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function freeTcpPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export type Stack = {
  host: Host;
  rig: CommissioningRig;
  port: number;
  storageDir: string;
  api(): ReturnType<typeof request>;
  /** Sidecar fabric id, as the plugin recorded it. */
  fabricId: string;
  /** Closes the plugin host and boots a new one on the same database, reconnected to the same sidecar. */
  restartPlugin(): Promise<void>;
  /** Stops the sidecar (its storage stays) and starts a new one on the same port and storage. */
  restartSidecar(options?: Pick<RigOptions, 'tuning' | 'config'>): Promise<void>;
  stopSidecar(): Promise<void>;
};

/** Everything a spec needs to clean up, in one place. */
export class Cleanup {
  private readonly stoppers: (() => Promise<unknown>)[] = [];
  private readonly directories: string[] = [];

  tmp(): string {
    const directory = mkdtempSync(join(tmpdir(), 'matter-e2e-'));
    this.directories.push(directory);
    return directory;
  }

  add(stop: () => Promise<unknown>): void {
    this.stoppers.push(stop);
  }

  async device(): Promise<VirtualDevice> {
    const started = await startVirtualDevice(this.tmp(), await freeUdpPort());
    this.add(() => started.stop());
    return started;
  }

  async second(): Promise<SecondController> {
    const started = await startSecondController();
    this.add(() => started.stop());
    return started;
  }

  async all(): Promise<void> {
    for (const stop of this.stoppers.splice(0).reverse()) await stop().catch(() => undefined);
    for (const directory of this.directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  }

  /** The plugin host with a real sidecar, the fabric created through the plugin (so the plugin records it). */
  async stack(options: Pick<RigOptions, 'tuning' | 'config'> = {}): Promise<Stack> {
    const storageDir = this.tmp();
    const port = await freeTcpPort();
    const startRig = (extra: Pick<RigOptions, 'tuning' | 'config'>, createFabric: boolean) =>
      startCommissioningRig({
        createFabric,
        tuning: extra.tuning,
        config: { storageDir, port, ...extra.config },
      });
    let rig = await startRig(options, false);
    let host = await bootHost();
    const stack: Stack = {
      get host() {
        return host;
      },
      get rig() {
        return rig;
      },
      port,
      storageDir,
      fabricId: '',
      api: () => request(host.app.getHttpServer()),
      async restartPlugin() {
        const { storage } = host;
        await host.close();
        host = await bootHost({ storage });
        await until(() => host.service.connection.status().state === 'connected', 30_000, 'the sidecar connection');
      },
      async stopSidecar() {
        await rig.stop();
      },
      async restartSidecar(next = options) {
        await rig.stop().catch(() => undefined);
        rig = await startRig(next, false);
      },
    };
    this.add(async () => {
      await host.close().catch(() => undefined);
      await rig.stop();
    });
    await stack
      .api()
      .put('/api/matter/connection')
      .set(ADMIN_ONLY)
      .send({ url: `http://127.0.0.1:${port}`, credential: TEST_TOKEN })
      .expect(200);
    await until(() => host.service.connection.status().state === 'connected', 30_000, 'the sidecar connection');
    const created = await stack.api().post('/api/matter/fabric/create').set(ADMIN_ONLY).send({}).expect(200);
    stack.fabricId = created.body.status.sidecar.fabricId;
    return stack;
  }
}

/** Starts a session through the plugin API. */
export const startSession = (stack: Stack, code: string, headers = COMMISSIONER, extra: Json = {}) =>
  stack
    .api()
    .post('/api/matter/commissioning/sessions')
    .set(headers)
    .send({ setupCode: code, ...extra });

/** Polls a session until it left `pending`/`running`. */
export async function settle(stack: Stack, id: string, headers = COMMISSIONER, timeoutMs = 150_000): Promise<Json> {
  return until(
    async () => {
      const view = (await stack.api().get(`/api/matter/commissioning/sessions/${id}`).set(headers).expect(200)).body;
      return view.state === 'pending' || view.state === 'running' ? null : view;
    },
    timeoutMs,
    `session ${id} to finish`,
  );
}

/** Starts a session and waits for its end. */
export async function commission(stack: Stack, code: string, headers = COMMISSIONER, extra: Json = {}): Promise<Json> {
  const started = await startSession(stack, code, headers, extra);
  if (started.status !== 201) throw new Error(`start refused: ${started.status} ${JSON.stringify(started.body)}`);
  return settle(stack, started.body.id, headers);
}

export const nodeList = async (stack: Stack, query = '?includeInactive=true'): Promise<Json[]> =>
  (await stack.api().get(`/api/matter/nodes${query}`).set(OPERATOR).expect(200)).body;

export const nodeDetail = async (stack: Stack, id: string): Promise<Json> =>
  (await stack.api().get(`/api/matter/nodes/${id}`).set(OPERATOR).expect(200)).body;

export const storedBackups = async (stack: Stack): Promise<Json[]> =>
  (await stack.api().get('/api/matter/fabric').set(ADMIN_ONLY).expect(200)).body.backups.stored;

export const auditActions = (stack: Stack): string[] =>
  stack.host.audit.map((event) => (event as unknown as { action: string }).action);

/** Every row of every plugin table, the audit records and the plugin and sidecar log lines, as one string. */
export async function everythingStored(stack: Stack): Promise<string> {
  const tables = matterStorage(stack.host.context).tables as unknown as Record<
    string,
    { find(): Promise<Record<string, unknown>[]> }
  >;
  const rows: Record<string, unknown> = {};
  for (const name of Object.keys(MATTER_TABLES)) {
    // The backups are encrypted blobs; their size and base64 text are not what a leak check is about.
    if (name === 'backups') continue;
    rows[name] = await tables[name].find();
  }
  return JSON.stringify({
    rows,
    audit: stack.host.audit,
    pluginLogs: stack.host.logs,
    sidecarLogs: stack.rig.logs,
    events: stack.rig.events,
  });
}

export function expectNoSecrets(everything: string, device: VirtualDevice, extra: string[] = []): void {
  for (const secret of [...Object.values(device.codes), ...extra]) expect(everything).not.toContain(secret);
  expect(everything).not.toMatch(/MT:[A-Z0-9.-]{10,}/);
  expect(everything).not.toContain(String(device.passcode).padStart(8, '0'));
}

export function loopbackMdns(): { start(): void; stop(): void } {
  let restore: (() => void) | undefined;
  return {
    start: () => (restore = useLoopbackMdns()),
    stop: () => restore?.(),
  };
}
