// Lab-only plugin for the BLE hardware tests (ATT-1033/ATT-1036). Never shipped: hil/test_ble.py builds it,
// drops it into the plugin directory of the API the HIL run starts and drives it over REST. It only uses
// `context.ble`, like a real plugin. Its REST routes run step scripts inside one session, so a test can
// exercise scan, connect, read, write, notifications, cancellation and long transfers on a real reader.
import {
  Auth,
  PluginBleError,
  type PluginBackendModule,
  type PluginBleContext,
  type PluginBleNotificationStream,
  type PluginBleSession,
  type PluginContext,
} from '@attraccess/plugins-backend-sdk';
import { Body, Controller, Inject, Post, type DynamicModule } from '@nestjs/common';

const CONTEXT = Symbol('ble-lab-fixture.context');

/** Generic GATT test peripheral (apps/attractap-lab/ble-test-peripheral). */
const peripheralUuid = (part: string) => `a7c0b1e0-${part}-4f6e-9b3a-5c1d2e3f4a50`;
const PROFILES = [
  {
    id: 'test-peripheral',
    advertisement: { serviceUuids: [peripheralUuid('0001')], namePrefix: 'AttrBLE-Test' },
    services: [
      {
        uuid: peripheralUuid('0001'),
        characteristics: [
          { key: 'read', uuid: peripheralUuid('0002'), operations: ['read' as const], maxReadBytes: 512 },
          {
            key: 'write',
            uuid: peripheralUuid('0003'),
            operations: ['read' as const, 'write' as const],
            maxReadBytes: 512,
            maxWriteBytes: 512,
          },
          {
            key: 'wwr',
            uuid: peripheralUuid('0004'),
            operations: ['writeWithoutResponse' as const],
            maxWriteBytes: 512,
          },
          { key: 'notify', uuid: peripheralUuid('0005'), operations: ['notify' as const], maxNotificationBytes: 512 },
          {
            key: 'indicate',
            uuid: peripheralUuid('0006'),
            operations: ['indicate' as const],
            maxNotificationBytes: 512,
          },
          { key: 'control', uuid: peripheralUuid('0007'), operations: ['write' as const], maxWriteBytes: 16 },
        ],
      },
    ],
    limits: { maxSessionMs: 900_000, maxNotificationQueue: 256 },
  },
  // PS Locks SOLO BT, from the vendor's public GATT table (API_DUAL_LOCK.pdf). Lab fixture only.
  {
    id: 'solo-bt',
    advertisement: { serviceUuids: ['4d4f4445-5343-4f2d-574f-514b45523232'] },
    services: [
      {
        uuid: '4d4f4445-5343-4f2d-574f-514b45523232',
        characteristics: [
          {
            key: 'unlock',
            uuid: '4d4f4445-5343-4f2d-574f-524a45523032',
            operations: ['write' as const],
            maxWriteBytes: 20,
          },
          {
            key: 'state',
            uuid: '4d4f4445-5343-4f2d-574f-524a45523038',
            operations: ['notify' as const],
            maxNotificationBytes: 20,
          },
          {
            key: 'token',
            uuid: '4d4f4445-5343-4f2d-574f-524a45523043',
            operations: ['read' as const],
            maxReadBytes: 20,
          },
        ],
      },
    ],
    limits: { maxSessionMs: 60_000, maxNotificationQueue: 16 },
  },
];

type Step = Record<string, unknown> & { op: string };
type StepResult = Record<string, unknown>;

interface ScriptState {
  session: PluginBleSession;
  streams: Map<string, PluginBleNotificationStream>;
}

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
const bytes = (value: unknown) => Uint8Array.from(Buffer.from(String(value ?? ''), 'hex'));
const failure = (error: unknown): StepResult =>
  error instanceof PluginBleError
    ? { ok: false, code: error.code, detail: error.detail ?? null, retryable: error.retryable }
    : { ok: false, code: 'THROWN', detail: (error as Error)?.message ?? String(error) };

/** A signal that aborts after `ms` (cancellation tests); none without `ms`. */
function abortAfter(ms: unknown): AbortSignal | undefined {
  if (typeof ms !== 'number') return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms).unref?.();
  return controller.signal;
}

function stream(state: ScriptState, key: unknown): PluginBleNotificationStream {
  const found = state.streams.get(String(key));
  if (!found) throw new Error(`not subscribed: ${String(key)}`);
  return found;
}

/** Long transfer: MTU-sized writes without response, each acknowledged by a notification (echo mode). */
async function transfer(state: ScriptState, step: Step): Promise<StepResult> {
  const { session } = state;
  const acks = stream(state, 'notify');
  const chunk = Math.min(session.mtu - 3, 512);
  const total = Number(step.bytes);
  const startedAt = Date.now();
  let sent = 0;
  let chunks = 0;
  while (sent < total || Date.now() - startedAt < Number(step.minDurationMs ?? 0)) {
    const size = Math.min(chunk, Math.max(total - sent, chunk));
    await session.write('wwr', new Uint8Array(size).fill(chunks & 0xff), { withoutResponse: true });
    await acks.next({ timeoutMs: 10_000 });
    sent += size;
    chunks += 1;
  }
  const seconds = (Date.now() - startedAt) / 1000;
  return { ok: true, mtu: session.mtu, chunk, chunks, bytes: sent, seconds, kibPerSecond: sent / 1024 / seconds };
}

/** Reads `count` notifications as fast as they come (burst tests). */
async function drain(state: ScriptState, step: Step): Promise<StepResult> {
  const notifications = stream(state, step.key);
  const startedAt = Date.now();
  for (let index = 0; index < Number(step.count); index++) await notifications.next({ timeoutMs: 10_000 });
  const seconds = (Date.now() - startedAt) / 1000;
  return { ok: true, count: step.count, perSecond: Number(step.count) / seconds };
}

const STEPS: Record<string, (state: ScriptState, step: Step) => Promise<StepResult>> = {
  read: async ({ session }, step) => ({
    ok: true,
    value: hex(await session.read(String(step.key), { signal: abortAfter(step.abortAfterMs) })),
  }),
  write: async ({ session }, step) => {
    await session.write(String(step.key), bytes(step.value), { withoutResponse: step.withoutResponse === true });
    return { ok: true };
  },
  subscribe: async (state, step) => {
    state.streams.set(String(step.key), await state.session.subscribe(String(step.key)));
    return { ok: true };
  },
  next: async (state, step) => {
    const notification = await stream(state, step.key).next({
      timeoutMs: Number(step.timeoutMs ?? 10_000),
      signal: abortAfter(step.abortAfterMs),
    });
    return { ok: true, value: hex(notification.value) };
  },
  unsubscribe: async (state, step) => {
    await state.session.unsubscribe(String(step.key));
    state.streams.delete(String(step.key));
    return { ok: true };
  },
  sleep: async (_state, step) => {
    await new Promise((resolve) => setTimeout(resolve, Number(step.ms)));
    return { ok: true };
  },
  mtu: async ({ session }) => ({ ok: true, mtu: session.mtu }),
  transfer,
  drain,
};

async function runStep(state: ScriptState, step: Step): Promise<StepResult> {
  const handler = STEPS[step.op];
  if (!handler) return { ok: false, code: 'UNKNOWN_STEP', detail: step.op };
  return handler(state, step).catch(failure);
}

@Auth()
@Controller('ble-lab')
export class BleLabController {
  constructor(@Inject(CONTEXT) private readonly context: PluginContext) {}

  private get ble(): PluginBleContext {
    const ble = this.context.ble;
    if (!ble) throw new Error('context.ble is missing');
    return ble;
  }

  @Post('readers')
  readers() {
    return this.ble.listReaders();
  }

  @Post('scan')
  async scan(@Body() body: { readerId: number; profileId: string; durationMs?: number; abortAfterMs?: number }) {
    const signal = abortAfter(body.abortAfterMs);
    return this.ble
      .scan(body.readerId, body.profileId, { durationMs: body.durationMs, signal })
      .then((ads) => ({
        ok: true,
        advertisements: ads.map((ad) => ({ ...ad, manufacturerData: ad.manufacturerData.length })),
      }))
      .catch(failure);
  }

  @Post('endpoints')
  async endpoint(
    @Body() body: { readerId: number; address: string; addressType: 'public' | 'random'; profileId: string },
  ) {
    return this.ble.createEndpoint(body).catch(failure);
  }

  /** Opens a session, runs the steps in order (a failed step does not stop the script) and closes it. */
  @Post('run')
  async run(
    @Body()
    body: {
      endpointId: string;
      leaseMs?: number;
      connectTimeoutMs?: number;
      abortOpenAfterMs?: number;
      steps: Step[];
    },
  ) {
    let session: PluginBleSession;
    try {
      session = await this.ble.openSession(body.endpointId, {
        leaseMs: body.leaseMs,
        connectTimeoutMs: body.connectTimeoutMs,
        signal: abortAfter(body.abortOpenAfterMs),
      });
    } catch (error) {
      return { open: failure(error), steps: [] };
    }
    const state: ScriptState = { session, streams: new Map() };
    const results: StepResult[] = [];
    for (const step of body.steps ?? []) results.push({ op: step.op, ...(await runStep(state, step)) });
    await session.close();
    return { open: { ok: true, mtu: session.mtu }, steps: results, closed: await session.closed };
  }
}

class BleLabModule {}

const plugin: PluginBackendModule = {
  register(context: PluginContext): DynamicModule {
    for (const profile of PROFILES) context.ble?.registerProfile(profile);
    return {
      module: BleLabModule,
      controllers: [BleLabController],
      providers: [{ provide: CONTEXT, useValue: context }],
    };
  },
};

export default plugin;
