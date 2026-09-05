import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Exercise the real persistence and runtime validators against the same snapshots.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { validateSnapshot as validateBackend } from '../../../backend/configuration';
import {
  hash,
  JsonStateStore,
  type RuntimeState,
  type Snapshot,
  validateSnapshot as validateRuntime,
  WagoRuntime,
} from '../runtime';
import { ModbusDeviceRouter } from './adapter';
import { ModbusTransportError, QueuedModbusTransport } from './transports';
import { readPdu, rtuFrame, writePdu } from './protocol';
import { acquireMeasurements, measurementErrorCode } from './acquisition';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let nextBus = 0;
function snapshot() {
  const format = {
    address: 12,
    addressBase: 0 as const,
    dataType: 'uint16' as const,
    byteOrder: 'big' as const,
    wordOrder: 'big' as const,
    scale: 1,
    offset: 0,
  };
  return {
    version: 1,
    modbus: {
      connections: [
        {
          id: 'bus',
          transport: 'rtu',
          path: `/dev/fixture-review-${++nextBus}`,
          baudRate: 19200,
          parity: 'even',
          stopBits: 1,
          timeoutMs: 25,
          reconnectMs: 0,
          queueLimit: 4,
        },
      ],
      devices: [
        { id: 'device', name: 'Device', connectionId: 'bus', unitId: 1, profileId: 'profile', profileVersion: 1 },
      ],
      profiles: [
        {
          id: 'profile',
          name: 'Profile',
          version: 1,
          measurements: [
            {
              ...format,
              id: 'energy',
              name: 'Energy',
              functionCode: 3,
              unit: 'watt-hour',
              kind: 'cumulative',
              rollover: 100,
              pollIntervalMs: 100,
            },
          ],
          actions: [{ ...format, id: 'switch', name: 'Switch', functionCode: 6, onValue: 1, offValue: 0 }],
        },
      ],
    },
    physicalPoints: [
      {
        id: 'point',
        hardwareProfile: 'modbus',
        channel: 0,
        modbus: { deviceId: 'device', measurementId: 'energy', actionId: 'switch' },
      },
    ],
    logicalChannels: [
      {
        id: 'energy-1',
        physicalPointId: 'point',
        profile: 'generic-monitored-input',
        capabilities: ['input', 'measurement'],
        disconnectPolicy: { mode: 'hold' },
        measurement: { unit: 'watt-hour', scale: 1, offset: 0, kind: 'cumulative' },
      },
      {
        id: 'output',
        physicalPointId: 'point',
        profile: 'generic-digital-output',
        capabilities: ['output'],
        disconnectPolicy: { mode: 'immediate' },
      },
    ],
  } satisfies Snapshot;
}
class MemoryStore extends JsonStateStore {
  saved: RuntimeState;
  constructor(initial: Snapshot) {
    super('/unused-in-memory');
    this.saved = {
      outputs: {},
      commandIds: [],
      accepted: { revision: 1, contentHash: hash(initial), snapshot: initial },
    };
  }
  override async load() {
    return structuredClone(this.saved);
  }
  override async save(state: RuntimeState) {
    this.saved = structuredClone(state);
  }
}
function harness(initial: Snapshot, device: ModbusDeviceRouter, store = new MemoryStore(initial)) {
  const published: Array<{ topic: string; payload: Record<string, unknown> }> = [];
  const runtime = new WagoRuntime({
    hardwareId: 'fixture',
    prefix: 'test',
    pairingCode: 'fixture',
    store,
    device,
    transport: {
      subscribe: async () => undefined,
      publish: async (topic, payload) => {
        published.push({ topic, payload: payload as Record<string, unknown> });
      },
    },
  });
  return { runtime, store, published };
}
const onboard = { read: async () => false, write: async () => undefined };
const desired = (s: Snapshot, revision = 2) =>
  Buffer.from(JSON.stringify({ protocolVersion: 1, revision, contentHash: hash(s), snapshot: s }));
const command = (id: string, value = true, revision = 1) =>
  Buffer.from(
    JSON.stringify({
      id,
      channelId: 'output',
      action: 'set',
      value,
      expectedConfigurationRevision: revision,
      expiresAt: '2099-01-01T00:00:00.000Z',
    }),
  );

describe('ATT-1059 independent review regressions', () => {
  it.each(['remove', 'rebind'])(
    'blocks route %s after an ambiguous ON, including after restart, until explicit OFF',
    async (mode) => {
      const s = snapshot();
      let energized = false;
      const request = jest.fn(async (_unit: number, pdu: Buffer) => {
        energized = pdu.readUInt16BE(3) === 1;
        if (energized) throw new Error('timeout after actuator applied ON');
        return pdu;
      });
      const store = new MemoryStore(s);
      // Exercise both old persisted states with no output and a last-confirmed OFF.
      if (mode === 'rebind') store.saved.outputs.output = false;
      const first = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })), store);
      await first.runtime.start();
      await first.runtime.receiveCommand(command('ambiguous-on'));
      expect(energized).toBe(true);
      expect(store.saved.uncertainOutputChannelIds).toEqual(['output']);
      expect(store.saved.outputs.output).not.toBe(true);
      expect(first.published).toContainEqual(
        expect.objectContaining({
          payload: expect.objectContaining({ id: 'ambiguous-on', status: 'rejected' }),
        }),
      );
      await first.runtime.receiveCommand(command('ambiguous-on'));
      expect(request).toHaveBeenCalledTimes(1);
      const next: Snapshot = structuredClone(s);
      if (mode === 'remove') {
        next.logicalChannels = [];
        next.physicalPoints = [];
        next.modbus.devices = [];
      } else next.modbus.profiles[0].actions[0].address = 22;
      expect(validateRuntime(next)).toEqual([]);
      const expectBlocked = async (h: ReturnType<typeof harness>) => {
        await h.runtime.receiveDesired(desired(next));
        expect(h.published.at(-1)?.payload).toEqual({
          revision: 2,
          contentHash: hash(next),
          errors: [expect.objectContaining({ path: 'snapshot', code: 'outputs_busy' })],
        });
        expect(store.saved.accepted?.revision).toBe(1);
      };
      await expectBlocked(first);
      const restarted = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })), store);
      await restarted.runtime.start();
      await expectBlocked(restarted);
      expect(request).toHaveBeenCalledTimes(1);
      request.mockRejectedValueOnce(new Error('OFF acknowledgement missing'));
      await restarted.runtime.receiveCommand(command('failed-off', false));
      expect(store.saved.uncertainOutputChannelIds).toEqual(['output']);
      await expectBlocked(restarted);
      await restarted.runtime.receiveCommand(command('explicit-off', false));
      expect(energized).toBe(false);
      expect(store.saved.uncertainOutputChannelIds).toEqual([]);
      expect(request).toHaveBeenCalledTimes(3);
      expect(request.mock.calls[2][1].readUInt16BE(1)).toBe(12);
      await restarted.runtime.receiveDesired(desired(next));
      expect(store.saved.accepted?.revision).toBe(2);
      expect(restarted.published).toContainEqual(
        expect.objectContaining({
          payload: { revision: 2, contentHash: hash(next), errors: [] },
        }),
      );
    },
  );
  it('persists uncertainty before transmission and blocks a fresh runtime before the write settles', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wago-uncertain-output-'));
    const pending = deferred<Buffer>();
    const entered = deferred<void>();
    try {
      const s = snapshot();
      const path = join(directory, 'state.json');
      const store = new JsonStateStore(path);
      await store.save({ outputs: {}, commandIds: [], accepted: { revision: 1, contentHash: hash(s), snapshot: s } });
      const request = jest.fn(() => {
        entered.resolve();
        return pending.promise;
      });
      const publish = jest.fn(async () => undefined);
      const createRuntime = () =>
        new WagoRuntime({
          hardwareId: 'fixture',
          prefix: 'test',
          pairingCode: 'fixture',
          store: new JsonStateStore(path),
          device: new ModbusDeviceRouter(onboard, () => ({ request })),
          transport: { subscribe: async () => undefined, publish },
        });
      const runtime = createRuntime();
      await runtime.start();
      const writing = runtime.receiveCommand(command('incomplete-on'));
      await entered.promise;
      expect(await store.load()).toMatchObject({
        outputs: {},
        uncertainOutputChannelIds: ['output'],
        commandIds: ['incomplete-on'],
      });
      const restarted = createRuntime();
      await restarted.start();
      const next = structuredClone(s);
      next.modbus.devices[0].unitId = 2;
      await restarted.receiveDesired(desired(next));
      expect(publish).toHaveBeenLastCalledWith(
        expect.stringContaining('/configuration/reported'),
        {
          revision: 2,
          contentHash: hash(next),
          errors: [expect.objectContaining({ code: 'outputs_busy' })],
        },
        { retain: true },
      );
      await restarted.receiveCommand(command('incomplete-on'));
      expect(request).toHaveBeenCalledTimes(1);
      pending.reject(new Error('lost acknowledgement'));
      await writing;
      expect((await store.load()).uncertainOutputChannelIds).toEqual(['output']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('does not transmit until uncertainty is saved, and does not transmit when that save fails', async () => {
    const s = snapshot();
    const request = jest.fn(async (_unit: number, pdu: Buffer) => pdu);
    const { runtime, store } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })));
    await runtime.start();
    const held = deferred<void>();
    const entered = deferred<void>();
    const save = store.save.bind(store);
    jest.spyOn(store, 'save').mockImplementation(async (state) => {
      if (state.uncertainOutputChannelIds?.length) {
        entered.resolve();
        await held.promise;
      }
      await save(state);
    });
    const writing = runtime.receiveCommand(command('unsaved-on'));
    await entered.promise;
    expect(request).not.toHaveBeenCalled();
    const failure = expect(writing).rejects.toThrow('disk failure');
    held.reject(new Error('disk failure'));
    await failure;
    expect(request).not.toHaveBeenCalled();
  });
  it('releases a command reservation when Modbus rejects it before transmission', async () => {
    const s = snapshot();
    const request = jest.fn(async () => {
      throw new ModbusTransportError('modbus_queue_full', 'Modbus queue full');
    });
    const { runtime, store } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })));
    await runtime.start();
    await runtime.receiveCommand(command('queue-full'));
    expect(store.saved.commandIds).toEqual([]);
    await runtime.receiveCommand(command('queue-full'));
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each(['disconnect', 'pulse'])(
    'attempts automatic %s OFF despite storage failure and keeps routing conservative',
    async (mode) => {
      jest.useFakeTimers();
      const s = snapshot();
      if (mode === 'pulse') {
        s.logicalChannels[1].capabilities.push('pulse');
        Object.assign(s.logicalChannels[1], { pulse: { durationMs: 10 } });
      }
      const values: number[] = [];
      const request = jest.fn(async (_unit: number, pdu: Buffer) => {
        values.push(pdu.readUInt16BE(3));
        return pdu;
      });
      const { runtime, store, published } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })));
      await runtime.start();
      await runtime.receiveCommand(
        mode === 'pulse'
          ? Buffer.from(
              JSON.stringify({
                id: 'energize',
                channelId: 'output',
                action: 'pulse',
                expectedConfigurationRevision: 1,
                expiresAt: '2099-01-01T00:00:00.000Z',
              }),
            )
          : command('energize'),
      );
      expect(store.saved).toMatchObject({ outputs: { output: true }, uncertainOutputChannelIds: [] });
      jest.spyOn(store, 'save').mockRejectedValue(new Error('disk failure'));
      if (mode === 'disconnect') await expect(runtime.setConnected(false)).rejects.toThrow('disk failure');
      else await jest.advanceTimersByTimeAsync(10);
      expect(values).toEqual([1, 0]);
      // The confirmation could not be saved: restart must still treat the old route as energized.
      expect(store.saved).toMatchObject({ outputs: { output: true }, uncertainOutputChannelIds: [] });
      const next = structuredClone(s);
      next.modbus.profiles[0].actions[0].address = 22;
      await runtime.receiveDesired(desired(next));
      expect(published.at(-1)?.payload.errors).toEqual([expect.objectContaining({ code: 'outputs_busy' })]);
      const restarted = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })), store);
      await restarted.runtime.start();
      await restarted.runtime.receiveDesired(desired(next));
      expect(restarted.published.at(-1)?.payload.errors).toEqual([expect.objectContaining({ code: 'outputs_busy' })]);
      expect(store.saved.accepted?.revision).toBe(1);
      await jest.advanceTimersByTimeAsync(100);
      expect(values).toEqual([1, 0]);
    },
  );
  it('clears uncertainty on confirmed ON but keeps the energized guard, and retains uncertainty on failed OFF persistence', async () => {
    const s = snapshot();
    const request = jest.fn(async (_unit: number, pdu: Buffer) => pdu);
    const { runtime, store, published } = harness(s, new ModbusDeviceRouter(onboard, () => ({ request })));
    await runtime.start();
    await runtime.receiveCommand(command('confirmed-on'));
    expect(store.saved).toMatchObject({ outputs: { output: true }, uncertainOutputChannelIds: [] });
    const next = structuredClone(s);
    next.modbus.devices[0].unitId = 2;
    await runtime.receiveDesired(desired(next));
    expect(published.at(-1)?.payload.errors).toEqual([expect.objectContaining({ code: 'outputs_busy' })]);
    const save = store.save.bind(store);
    const saving = jest.spyOn(store, 'save').mockImplementation(async (state) => {
      if (state.outputs.output === false && !state.uncertainOutputChannelIds?.length) throw new Error('disk failure');
      await save(state);
    });
    await expect(runtime.receiveCommand(command('off-save-fails', false))).rejects.toThrow(
      'failed to persist channel state',
    );
    expect(store.saved).toMatchObject({ outputs: { output: true }, uncertainOutputChannelIds: [] });
    await runtime.receiveDesired(desired(next));
    expect(published.at(-1)?.payload.errors).toEqual([expect.objectContaining({ code: 'outputs_busy' })]);
    expect(request).toHaveBeenCalledTimes(2);
    saving.mockRestore();
    await runtime.receiveCommand(command('confirmed-off', false));
    await runtime.receiveDesired(desired(next));
    expect(store.saved).toMatchObject({
      outputs: { output: false },
      uncertainOutputChannelIds: [],
      accepted: { revision: 2 },
    });
  });
  it.each(['/dev/ttyS0', '/dev/serial/by-id/fixture.0'])('accepts canonical RTU path %s at both boundaries', (path) => {
    const s = snapshot();
    s.modbus.connections[0].path = path;
    expect(validateBackend(s)).toEqual([]);
    expect(validateRuntime(s)).toEqual([]);
  });
  it.each(['/dev/./ttyS0', '/dev//ttyS0', '/dev/ttyS0/', '/dev/sub/../ttyS0'])(
    'rejects noncanonical RTU path %s at both boundaries',
    (path) => {
      const s = snapshot();
      s.modbus.connections[0].path = path;
      for (const validate of [validateBackend, validateRuntime]) {
        expect(validate(s)).toEqual(
          expect.arrayContaining([expect.objectContaining({ path: 'modbus.connections[0]', code: 'invalid_modbus' })]),
        );
      }
    },
  );
  it.each(['path', 'host', 'port'])('rejects non-coercible endpoint %s at both boundaries', (field) => {
    const s = snapshot();
    if (field !== 'path') {
      Object.assign(s.modbus.connections[0], { transport: 'tcp', host: 'fixture.invalid', port: 502 });
    }
    Object.assign(s.modbus.connections[0], { [field]: { toString: null } });
    for (const validate of [validateBackend, validateRuntime]) {
      expect(validate(s)).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'modbus.connections[0]', code: 'invalid_modbus' })]),
      );
    }
  });
  it.each(['.', '', 'sub/..', 'trailing'])(
    'shares RTU quarantine with directly constructed lexical alias %p',
    async (segment) => {
      for (const aliasFirst of [false, true]) {
        const s = snapshot();
        const c = s.modbus.connections[0];
        const exchange = jest.fn(async () => {
          throw new Error('ambiguous serial failure');
        });
        const pdu = readPdu(3, s.modbus.profiles[0].measurements[0]);
        const alias = {
          ...c,
          path: segment === 'trailing' ? `${c.path}/` : c.path.replace('/dev/', `/dev/${segment}/`),
        };
        await expect(new QueuedModbusTransport(aliasFirst ? alias : c, exchange).request(1, pdu)).rejects.toThrow();
        await expect(new QueuedModbusTransport(aliasFirst ? c : alias, exchange).request(1, pdu)).rejects.toMatchObject(
          {
            code: 'modbus_rtu_quarantined',
          },
        );
        expect(exchange).toHaveBeenCalledTimes(1);
      }
    },
  );
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it.each([null, true, false, [], [0], '', '0', '12', 1.5])(
    'rejects malformed source addresses %p through both boundaries',
    (address) => {
      for (const entry of ['measurements', 'actions'] as const) {
        const s = snapshot();
        const profile = s.modbus.profiles[0];
        Object.assign(profile[entry][0], { address });
        expect(validateBackend(s).length).toBeGreaterThan(0);
        expect(validateRuntime(s).length).toBeGreaterThan(0);
        if (entry === 'measurements') expect(() => readPdu(3, profile.measurements[0])).toThrow('address');
        else expect(() => writePdu(6, profile.actions[0], 1)).toThrow('address');
      }
    },
  );
  it.each([null, {}, true, 1, 'measurement'])('rejects malformed capabilities %p without throwing', (capabilities) => {
    const s = snapshot();
    Object.assign(s.logicalChannels[0], { capabilities });
    expect(validateBackend(s).length).toBeGreaterThan(0);
    expect(validateRuntime(s).length).toBeGreaterThan(0);
  });
  it('rejects input channels bound only to an action at both boundaries', () => {
    const s = snapshot();
    delete s.physicalPoints[0].modbus.measurementId;
    s.logicalChannels[0].capabilities = ['input'];
    delete s.logicalChannels[0].measurement;
    for (const validate of [validateBackend, validateRuntime])
      expect(validate(s)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'invalid_modbus_binding', message: 'input requires named measurement' }),
        ]),
      );
  });
  it.each(['remove', 'rebind'])('cancels a queued router ON after device %s', async (mode) => {
    const s = snapshot();
    const reply = deferred<Buffer>();
    const started = deferred<void>();
    const exchange = jest.fn(async () => {
      started.resolve();
      return reply.promise;
    });
    const router = new ModbusDeviceRouter(onboard, (c) => new QueuedModbusTransport(c, exchange));
    router.configure(s);
    const read = router.read(s.physicalPoints[0]).catch((e: Error) => e);
    await started.promise;
    const write = router.write(s.physicalPoints[0], true).catch((e: Error) => e);
    const next = structuredClone(s);
    if (mode === 'remove') next.modbus.devices = [];
    else next.modbus.devices[0].unitId = 2;
    router.configure(next);
    reply.resolve(rtuFrame(1, Buffer.from([3, 2, 0, 1])));
    await read;
    expect(await write).toBeInstanceOf(Error);
    expect(exchange).toHaveBeenCalledTimes(1);
  });
  it('does not route commands during held configuration persistence', async () => {
    const s = snapshot();
    const writes: number[] = [];
    const router = new ModbusDeviceRouter(onboard, () => ({
      request: async (_unit, pdu) => {
        writes.push(pdu.readUInt16BE(1));
        return pdu;
      },
    }));
    const { runtime, store } = harness(s, router);
    await runtime.start();
    const held = deferred<void>();
    const entered = deferred<void>();
    const save = store.save.bind(store);
    jest.spyOn(store, 'save').mockImplementationOnce(async (state) => {
      entered.resolve();
      await held.promise;
      await save(state);
    });
    const next = structuredClone(s);
    next.modbus.profiles[0].actions[0].address = 22;
    const apply = runtime.receiveDesired(desired(next));
    await entered.promise;
    await runtime.receiveCommand(command('during-save'));
    expect(writes).toEqual([]);
    held.resolve();
    await apply;
    await runtime.receiveCommand(command('after-save', true, 2));
    expect(writes).toEqual([22]);
  });
  it('retains old snapshot and route after failed configuration persistence', async () => {
    const s = snapshot();
    const writes: number[] = [];
    const router = new ModbusDeviceRouter(onboard, () => ({
      request: async (_unit, pdu) => {
        writes.push(pdu.readUInt16BE(1));
        return pdu;
      },
    }));
    const { runtime, store } = harness(s, router);
    await runtime.start();
    const next = structuredClone(s);
    next.physicalPoints[0].modbus.actionId = 'new-action';
    next.modbus.profiles[0].actions[0].id = 'new-action';
    next.modbus.profiles[0].actions[0].address = 22;
    jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk failure'));
    await runtime.receiveDesired(desired(next));
    await runtime.receiveCommand(command('after-failure'));
    expect(writes).toEqual([12]);
    expect(store.saved.accepted?.revision).toBe(1);
  });
  it('preserves cumulative rollover and decrease-fault history across unrelated revisions', async () => {
    for (const rollover of [100, undefined]) {
      const s = snapshot();
      s.modbus.profiles[0].measurements[0].rollover = rollover;
      const values = [95, 3, 4];
      const router = new ModbusDeviceRouter(onboard, () => ({
        request: async () => Buffer.from([0, values.shift() ?? 0]),
      }));
      router.configure(s);
      expect(await router.read(s.physicalPoints[0])).toBe(95);
      if (rollover) expect(await router.read(s.physicalPoints[0])).toBe(103);
      else await expect(router.read(s.physicalPoints[0])).rejects.toThrow('decreased');
      const next = structuredClone(s);
      next.modbus.devices[0].name = 'Renamed';
      next.modbus.profiles[0].version = 2;
      next.modbus.devices[0].profileVersion = 2;
      next.modbus.profiles[0].measurements[0].pollIntervalMs = 200;
      router.configure(next);
      if (rollover) expect(await router.read(next.physicalPoints[0])).toBe(104);
      else await expect(router.read(next.physicalPoints[0])).rejects.toThrow('decreased');
    }
  });
  it('acquires one shared source once and publishes all bound channels with the original read timestamp', async () => {
    const s = snapshot();
    s.modbus.profiles[0].measurements[0].scale = 0.05;
    s.physicalPoints.push({ ...s.physicalPoints[0], id: 'alias' });
    s.logicalChannels.push({ ...s.logicalChannels[0], id: 'energy-2', physicalPointId: 'alias' });
    const request = jest.fn(async () => Buffer.from([0, 10]));
    const router = new ModbusDeviceRouter(onboard, () => ({ request }));
    const { runtime, published } = harness(s, router);
    await runtime.start();
    await runtime.publishMeasurements();
    const events = published.filter((p) => p.topic.endsWith('/measurements'));
    expect(events.map((p) => p.payload.channelId)).toEqual(['energy-1', 'energy-2']);
    expect(request).toHaveBeenCalledTimes(1);
    expect(Number(events[1].payload.sequence)).toBe(Number(events[0].payload.sequence) + 1);
    for (const { payload } of events) {
      expect(payload).toEqual(
        expect.objectContaining({
          unit: 'milliwatt-hour',
          value: 500,
          kind: 'cumulative',
          timestamp: expect.any(String),
          streamId: expect.any(String),
        }),
      );
      expect(payload).not.toHaveProperty('sourceTimestamp');
    }
    expect(events[0].payload.timestamp).toEqual(events[1].payload.timestamp);
    expect(events[0].payload.streamId).toEqual(published.find((p) => p.topic.endsWith('/state'))?.payload.streamId);
    await runtime.publishMeasurements();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('quarantines RTU after timeout, rejecting another same-length/different-address read before and after late teardown', async () => {
    const s = snapshot();
    const c = s.modbus.connections[0];
    const late = deferred<Buffer>();
    const exchange = jest.fn(() => late.promise);
    const transport = new QueuedModbusTransport(c, exchange);
    const a = readPdu(3, s.modbus.profiles[0].measurements[0]);
    const b = Buffer.from(a);
    b.writeUInt16BE(22, 1);
    await expect(transport.request(1, a)).rejects.toThrow('timed out');
    const replacement = new QueuedModbusTransport(c, exchange);
    // The late A response has a valid CRC/unit/function/count for B, but B must never be sent.
    const second = replacement.request(1, b).catch((e: Error) => e);
    late.resolve(rtuFrame(1, Buffer.from([3, 2, 0, 99])));
    expect(await second).toBeInstanceOf(Error);
    await expect(replacement.request(1, b)).rejects.toThrow('quarantin');
    expect(exchange).toHaveBeenCalledTimes(1);
  });
  it('preserves actual acquisition time while publication is delayed, and retains typed errors for the ATT-979 encoder', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const s = snapshot();
    s.logicalChannels.push({ ...s.logicalChannels[0], id: 'energy-2' });
    const router = new ModbusDeviceRouter(onboard, () => ({
      request: async () => {
        jest.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
        return Buffer.from([0, 10]);
      },
    }));
    router.configure(s);
    const readings = acquireMeasurements(s, router);
    const result = await readings.next();
    jest.setSystemTime(new Date('2026-01-01T00:00:10.000Z'));
    expect(result.value).toEqual(expect.objectContaining({ ok: true, timestamp: '2026-01-01T00:00:01.000Z', raw: 10 }));
    const typed = Object.assign(new Error('encoder rejected fraction'), { code: 'invalid_measurement_transform' });
    expect(measurementErrorCode(typed)).toBe('invalid_measurement_transform');
    const failing = new ModbusDeviceRouter(onboard, () => ({
      request: async () => {
        throw Object.assign(new Error('ambiguous'), { code: 'modbus_rtu_quarantined' });
      },
    }));
    const { runtime, published } = harness(s, failing);
    await runtime.start();
    await runtime.publishMeasurements();
    expect(published.filter((p) => p.topic.endsWith('/faults')).map((p) => p.payload.code)).toEqual([
      'modbus_rtu_quarantined',
      'modbus_rtu_quarantined',
    ]);
    expect(published.some((p) => p.topic.endsWith('/measurements'))).toBe(false);
  });
  it('does not suspend the route of an active pulse to persist a new configuration', async () => {
    jest.useFakeTimers();
    const s = snapshot();
    s.logicalChannels[1].capabilities.push('pulse');
    Object.assign(s.logicalChannels[1], { pulse: { durationMs: 10 } });
    const values: number[] = [];
    const router = new ModbusDeviceRouter(onboard, () => ({
      request: async (_unit, pdu) => {
        values.push(pdu.readUInt16BE(3));
        return pdu;
      },
    }));
    const { runtime, store, published } = harness(s, router);
    await runtime.start();
    await runtime.receiveCommand(
      Buffer.from(
        JSON.stringify({
          id: 'pulse',
          channelId: 'output',
          action: 'pulse',
          expectedConfigurationRevision: 1,
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
      ),
    );
    const next = structuredClone(s);
    next.modbus.profiles[0].actions[0].address = 22;
    await runtime.receiveDesired(desired(next));
    expect(store.saved.accepted?.revision).toBe(1);
    expect(published).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          errors: expect.arrayContaining([expect.objectContaining({ code: 'outputs_busy' })]),
        }),
      }),
    );
    await jest.advanceTimersByTimeAsync(10);
    expect(values).toEqual([1, 0]);
  });
  it('shuts down an uncertain pulse ON on its original route and preserves command deduplication', async () => {
    jest.useFakeTimers();
    try {
      const s = snapshot();
      s.logicalChannels[1].capabilities.push('pulse');
      Object.assign(s.logicalChannels[1], { pulse: { durationMs: 10 } });
      const writes: Array<{ unit: number; address: number; value: number }> = [];
      const router = new ModbusDeviceRouter(onboard, () => ({
        request: async (unit, pdu) => {
          const value = pdu.readUInt16BE(3);
          writes.push({ unit, address: pdu.readUInt16BE(1), value });
          if (value === 1) throw new Error('response lost after ON');
          return pdu;
        },
      }));
      const { runtime, store, published } = harness(s, router);
      await runtime.start();
      const pulse = Buffer.from(
        JSON.stringify({
          id: 'uncertain-pulse',
          channelId: 'output',
          action: 'pulse',
          expectedConfigurationRevision: 1,
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
      );
      await runtime.receiveCommand(pulse);
      const next = structuredClone(s);
      next.modbus.devices[0].unitId = 2;
      next.modbus.profiles[0].actions[0].address = 22;
      await runtime.receiveDesired(desired(next));
      expect(store.saved.accepted?.revision).toBe(1);
      await jest.advanceTimersByTimeAsync(10);
      expect(writes).toEqual([
        { unit: 1, address: 12, value: 1 },
        { unit: 1, address: 12, value: 0 },
      ]);
      await runtime.receiveCommand(pulse);
      expect(writes).toHaveLength(2);
      expect(published).toContainEqual(
        expect.objectContaining({ payload: expect.objectContaining({ id: 'uncertain-pulse', status: 'duplicate' }) }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
