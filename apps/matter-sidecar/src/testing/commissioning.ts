// Test-only helpers for the commissioning integration tests: a real sidecar (real controller, real matter.js) with the
// test seams on, and calls that wait for a session to finish. Excluded from the shipped build like the rest of `src/testing`.
import type { CommissioningSession, EventEnvelope } from '@attraccess/matter-contract';
import type { SidecarConfig } from '../config';
import { loadMatterPlatform, type FabricTuning, type MatterPlatform } from '../matter-platform';
import { http, startSidecar, validHeaders, type JsonBody, type Running } from './harness';

export type CommissioningRig = Running & {
  platform(): MatterPlatform;
  /** Every event the sidecar published since the rig started, in order. */
  events: EventEnvelope[];
  call(method: string, path: string, body?: unknown): ReturnType<typeof http>;
  /** Starts a session and waits until it has succeeded or failed. */
  commission(setupCode: string, extra?: Record<string, unknown>): Promise<CommissioningSession>;
  waitFor(sessionId: string, timeoutMs?: number): Promise<CommissioningSession>;
};

export type RigOptions = {
  config?: Partial<SidecarConfig>;
  tuning?: FabricTuning;
  /** Create the fabric right away (default true). */
  createFabric?: boolean;
};

export async function startCommissioningRig(options: RigOptions = {}): Promise<CommissioningRig> {
  let platform: MatterPlatform | undefined;
  const running = await startSidecar(options.config ?? {}, {
    loadPlatform: async (context) => (platform = await loadMatterPlatform(context, options.tuning)),
  });
  const events: EventEnvelope[] = [];
  running.sidecar.stream.subscribe((event) => events.push(event));
  const call = (method: string, path: string, body?: unknown) =>
    http(running.port, method, path, {
      headers: { ...validHeaders(), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const waitFor = async (sessionId: string, timeoutMs = 90_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const session = (await call('GET', `/v1/commissioning/sessions/${sessionId}`)).body as CommissioningSession;
      if (session.state === 'succeeded' || session.state === 'failed') return session;
      if (Date.now() > deadline) throw new Error(`session ${sessionId} did not finish: ${JSON.stringify(session)}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  if (options.createFabric !== false) {
    const created: JsonBody = await call('POST', '/v1/fabric', { label: 'Attraccess' });
    if (created.status !== 200) throw new Error(`the fabric was not created: ${created.raw}`);
  }
  return {
    ...running,
    platform: () => platform as MatterPlatform,
    events,
    call,
    waitFor,
    async commission(setupCode, extra = {}) {
      const started = await call('POST', '/v1/commissioning/sessions', { setupCode, ...extra });
      if (started.status !== 200) throw new Error(`start refused: ${started.raw}`);
      return waitFor(started.body.sessionId);
    },
  };
}
