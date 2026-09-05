import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cc100OnboardIoAdapter } from './adapters';
import { CC100_DIGITAL_PROFILE } from './onboard-profile';
import { hash, JsonStateStore, WagoRuntime, type Snapshot, type Transport } from './runtime';

const point = (channel: number): Snapshot['physicalPoints'][number] => ({
  id: `point-${channel}`,
  hardwareProfile: '751-9301',
  channel,
});
const snapshot: Snapshot = {
  version: 1,
  physicalPoints: CC100_DIGITAL_PROFILE.channels.map(({ channel }) => point(channel)),
  logicalChannels: CC100_DIGITAL_PROFILE.channels.map(({ channel, name, direction }) => ({
    id: name,
    physicalPointId: point(channel).id,
    profile: `generic-digital-${direction}`,
    capabilities: [direction],
    disconnectPolicy: { mode: 'immediate' },
  })),
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('CC100 packed digital I/O', () => {
  let directory: string;
  let paths: { input: string; output: string };
  let adapter: Cc100OnboardIoAdapter;
  let runtime: WagoRuntime;
  let store: JsonStateStore;
  let messages: Array<{ topic: string; payload: Record<string, unknown> }>;
  let transport: Transport;
  const state = () => messages.filter(({ topic }) => topic.endsWith('/state')).at(-1)?.payload;
  const apply = (value = snapshot, revision = 1) =>
    runtime.receiveDesired(
      Buffer.from(
        JSON.stringify({
          protocolVersion: 1,
          revision,
          contentHash: hash(value),
          snapshot: value,
        }),
      ),
    );
  const command = (channelId: string, value: boolean, id = channelId, action = 'set') =>
    runtime.receiveCommand(
      Buffer.from(
        JSON.stringify({
          id,
          channelId,
          action,
          value,
          expectedConfigurationRevision: 1,
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
      ),
    );

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cc100-digital-'));
    paths = { input: join(directory, 'din'), output: join(directory, 'dout') };
    await writeFile(paths.input, '0');
    await writeFile(paths.output, '0');
    adapter = new Cc100OnboardIoAdapter(paths);
    store = new JsonStateStore(join(directory, 'state.json'));
    messages = [];
    transport = {
      publish: async (topic, payload) => {
        messages.push({ topic, payload: payload as Record<string, unknown> });
      },
      subscribe: async () => undefined,
    };
    runtime = new WagoRuntime({
      hardwareId: 'test',
      prefix: 'test',
      pairingCode: 'synthetic',
      store,
      transport,
      device: adapter,
    });
  });
  afterEach(async () => {
    jest.useRealTimers();
    await rm(directory, { recursive: true, force: true });
  });

  it('extracts every input independently for all packed byte values', async () => {
    for (let value = 0; value <= 255; value++) {
      await writeFile(paths.input, `${value}\n`);
      expect(await Promise.all(Array.from({ length: 8 }, (_, bit) => adapter.read(point(bit + 4))))).toEqual(
        Array.from({ length: 8 }, (_, bit) => Boolean(value & (1 << bit))),
      );
    }
  });

  it('keeps installer manifest and executable profile in sync', async () => {
    const manifest = JSON.parse(await readFile(join(__dirname, '../manifest.json'), 'utf8'));
    expect(manifest.deployment.hardwareProfile).toBe(CC100_DIGITAL_PROFILE.id);
    expect(manifest.deployment.privileged).toBe(false);
    expect(manifest.deployment.mounts).toEqual(
      Object.values(CC100_DIGITAL_PROFILE.registers).map((register) => ({
        source: register.hostPath,
        target: register.path,
        readOnly: register.readOnly,
      })),
    );
  });

  it('serializes simultaneous channel writes and preserves unrelated register bits', async () => {
    await writeFile(paths.output, '240');
    await Promise.all([0, 1, 2, 3].map((channel) => adapter.write(point(channel), true)));
    expect(await readFile(paths.output, 'utf8')).toBe('255');
    await Promise.all([0, 2].map((channel) => adapter.write(point(channel), false)));
    expect(await readFile(paths.output, 'utf8')).toBe('250');
    expect(await Promise.all([0, 1, 2, 3].map((channel) => adapter.read(point(channel))))).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it.each(['', 'true', '-1', '1.5', '256', '1oops', '0x10'])(
    'rejects malformed packed register %j without clobbering it',
    async (value) => {
      await writeFile(paths.output, value);
      await expect(adapter.write(point(0), true)).rejects.toThrow('invalid packed digital register');
      expect(await readFile(paths.output, 'utf8')).toBe(value);
      await writeFile(paths.output, '8');
      await adapter.write(point(0), true);
      expect(await readFile(paths.output, 'utf8')).toBe('9');
    },
  );

  it('rejects invalid channels, profiles and input writes', async () => {
    for (const channel of [-1, 12, 0.5])
      await expect(adapter.read(point(channel))).rejects.toThrow('supported CC100 channels');
    await expect(adapter.read({ ...point(0), hardwareProfile: '879-3000' })).rejects.toThrow(
      'supported CC100 channels',
    );
    await expect(adapter.write(point(4), true)).rejects.toThrow('DI1 is not an output');
    expect(await readFile(paths.output, 'utf8')).toBe('0');
  });

  it('validates direction, aliases and unsupported measurement before configuration acceptance', async () => {
    expect(adapter.validate(snapshot)).toEqual([]);
    const invalid = structuredClone(snapshot);
    invalid.logicalChannels[0].capabilities = ['input'];
    invalid.logicalChannels[4].capabilities = ['input', 'pulse'];
    invalid.logicalChannels[5].capabilities = ['measurement'];
    invalid.physicalPoints.push({ ...point(0), id: 'alias' });
    invalid.logicalChannels.push({ ...snapshot.logicalChannels[1], id: 'DO2-alias' });
    expect(adapter.validate(invalid).map(({ code }) => code)).toEqual(
      expect.arrayContaining(['invalid_direction', 'unsupported_point', 'duplicate_output']),
    );
    await runtime.start();
    await apply(invalid);
    expect(messages.filter(({ topic }) => topic.endsWith('/configuration/reported')).at(-1)?.payload.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid_direction' })]),
    );
    expect((await store.load()).accepted).toBeUndefined();
  });

  it('reports malformed referenced guard capabilities instead of throwing', async () => {
    await runtime.start();
    const invalid = {
      ...snapshot,
      logicalChannels: snapshot.logicalChannels.map((channel, index) =>
        index === 0
          ? {
              ...channel,
              capabilities: ['output', 'guard', 'feedback'],
              guard: { channelId: 'DI1', when: 'on' },
              feedback: { channelId: 'DI1', expected: 'match', timeoutMs: 10 },
            }
          : index === 4
            ? { ...channel, capabilities: {} }
            : channel,
      ),
    };
    await runtime.receiveDesired(
      Buffer.from(JSON.stringify({ protocolVersion: 1, revision: 1, contentHash: hash(invalid), snapshot: invalid })),
    );
    expect(messages.at(-1)?.payload.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_guard' }),
        expect.objectContaining({ code: 'invalid_feedback' }),
      ]),
    );
  });

  it('does not let stalled reconnect telemetry hold pulse shutdown or disconnect writes', async () => {
    await runtime.start();
    const pulsed = structuredClone(snapshot);
    pulsed.logicalChannels[0].capabilities.push('pulse');
    pulsed.logicalChannels[0].pulse = { durationMs: 20 };
    await apply(pulsed);
    const started = deferred();
    const release = deferred();
    const publish = transport.publish.bind(transport);
    jest.spyOn(transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith('/state')) {
        started.resolve();
        await release.promise;
      }
      await publish(topic, payload, options);
    });
    await writeFile(paths.input, '1');
    const reconnect = runtime.setConnected(true);
    await started.promise;
    try {
      await reconnect;
      await command('DO1', true, 'pulse', 'pulse');
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(await readFile(paths.output, 'utf8')).toBe('0');
      await command('DO2', true);
      const writtenOff = deferred();
      const write = adapter.write.bind(adapter);
      jest.spyOn(adapter, 'write').mockImplementation(async (physical, value) => {
        await write(physical, value);
        if (physical.channel === 3 && !value) writtenOff.resolve();
      });
      const disconnect = runtime.setConnected(false);
      await writtenOff.promise;
      expect(await readFile(paths.output, 'utf8')).toBe('0');
      release.resolve();
      await disconnect;
    } finally {
      release.resolve();
    }
  });

  it('does not overwrite a configuration commit with a simultaneous sequence reservation', async () => {
    await runtime.start();
    await apply();
    for (let index = 0; index < 100; index++) await command('missing', true, `unknown-${index}`);
    expect(Number(messages.at(-1)?.payload.sequence)).toBe(100);
    const started = deferred();
    const release = deferred();
    const save = store.save.bind(store);
    let delay = true;
    jest.spyOn(store, 'save').mockImplementation(async (value) => {
      if (value.accepted?.revision === 2 && delay) {
        delay = false;
        started.resolve();
        await release.promise;
      }
      await save(value);
    });
    const applying = apply(snapshot, 2);
    await started.promise;
    const allocation = command('missing', true, 'during-commit');
    release.resolve();
    await Promise.all([applying, allocation]);
    expect((await store.load()).accepted?.revision).toBe(2);
    expect((await store.load()).sequence).toBe(200);
  });

  it('finishes pulse shutdown while a command acknowledgement is stalled', async () => {
    await runtime.start();
    const pulsed = structuredClone(snapshot);
    pulsed.logicalChannels[0].capabilities.push('pulse');
    pulsed.logicalChannels[0].pulse = { durationMs: 20 };
    await apply(pulsed);
    const started = deferred();
    const release = deferred();
    const publish = transport.publish.bind(transport);
    jest.spyOn(transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith('/acknowledgements')) {
        started.resolve();
        await release.promise;
      }
      await publish(topic, payload, options);
    });
    const action = command('DO1', true, 'pulse', 'pulse');
    await started.promise;
    try {
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(await readFile(paths.output, 'utf8')).toBe('0');
    } finally {
      release.resolve();
      await action;
      await runtime.pollInputs();
    }
  });

  it('retries a failed pulse shutdown while its fault acknowledgement is stalled', async () => {
    await runtime.start();
    const pulsed = structuredClone(snapshot);
    pulsed.logicalChannels[0].capabilities.push('pulse');
    pulsed.logicalChannels[0].pulse = { durationMs: 20 };
    await apply(pulsed);
    const started = deferred();
    const release = deferred();
    const retried = deferred();
    const publish = transport.publish.bind(transport);
    jest.spyOn(transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith('/faults')) {
        started.resolve();
        await release.promise;
      }
      await publish(topic, payload, options);
    });
    const write = adapter.write.bind(adapter);
    let fail = true;
    jest.spyOn(adapter, 'write').mockImplementation(async (physical, value) => {
      if (!value && fail) {
        fail = false;
        throw new Error('temporary write failure');
      }
      await write(physical, value);
      if (!value) retried.resolve();
    });
    await command('DO1', true, 'pulse', 'pulse');
    await started.promise;
    try {
      await retried.promise;
      expect(await readFile(paths.output, 'utf8')).toBe('0');
    } finally {
      release.resolve();
      await runtime.pollInputs();
    }
  });

  it('coalesces many writes behind stalled telemetry into one pending refresh', async () => {
    await runtime.start();
    await apply();
    const started = deferred();
    const release = deferred();
    const publish = transport.publish.bind(transport);
    jest.spyOn(transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith('/state')) {
        started.resolve();
        await release.promise;
      }
      await publish(topic, payload, options);
    });
    const read = jest.spyOn(adapter, 'read');
    await writeFile(paths.input, '1');
    const poll = runtime.pollInputs();
    await started.promise;
    try {
      for (let index = 0; index < 50; index++) await command('DO1', Boolean(index % 2), `write-${index}`);
      expect(read).toHaveBeenCalledTimes(12);
    } finally {
      release.resolve();
      await poll;
    }
    expect(read).toHaveBeenCalledTimes(24);
  });

  it('publishes reserved JavaScript property names as ordinary logical channel IDs', async () => {
    await runtime.start();
    const named = structuredClone(snapshot);
    named.logicalChannels[4].id = '__proto__';
    await writeFile(paths.input, '1');
    await apply(named);
    const inputs = JSON.parse(JSON.stringify(state()?.inputs));
    expect(Object.hasOwn(inputs, '__proto__')).toBe(true);
    expect(inputs['__proto__']).toBe(true);
  });

  it('does not publish old retained state after a revision commits during fault publication', async () => {
    await runtime.start();
    await apply();
    const started = deferred();
    const release = deferred();
    const committed = deferred();
    const publish = transport.publish.bind(transport);
    jest.spyOn(transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith('/faults')) {
        started.resolve();
        await release.promise;
      }
      await publish(topic, payload, options);
      if (topic.endsWith('/configuration/reported')) committed.resolve();
    });
    await writeFile(paths.input, 'invalid');
    const poll = runtime.pollInputs();
    await started.promise;
    const applying = apply(snapshot, 2);
    await committed.promise;
    const messageCount = messages.length;
    release.resolve();
    await Promise.all([poll, applying]);
    expect(
      messages
        .slice(messageCount)
        .filter(({ topic }) => topic.endsWith('/state'))
        .map(({ payload }) => payload.revision),
    ).toEqual([2]);
  });

  it.each(['stalled', 'rejected'])('invalidates failed input reads even when fault publication is %s', async (mode) => {
    await runtime.start();
    await writeFile(paths.input, '255');
    await apply();
    const release = deferred();
    const publish = transport.publish.bind(transport);
    jest.spyOn(transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith('/faults')) {
        if (mode === 'rejected') throw new Error('fault delivery failed');
        await release.promise;
      }
      await publish(topic, payload, options);
    });
    await writeFile(paths.input, 'invalid');
    try {
      await runtime.pollInputs();
      expect(state()?.inputs).toEqual({});
      expect(state()?.readiness).toEqual(expect.objectContaining({ ready: false }));
      await writeFile(paths.input, '2');
      await runtime.pollInputs();
      expect(state()?.inputs).toEqual(expect.objectContaining({ DI1: false, DI2: true }));
      expect(state()?.readiness).toEqual(expect.objectContaining({ ready: true }));
    } finally {
      release.resolve();
    }
  });

  it('publishes typed input changes and actual output state, not aggregate truthiness or stale commands', async () => {
    await runtime.start();
    await writeFile(paths.input, '5');
    await writeFile(paths.output, '2');
    await apply();
    expect(state()).toEqual(
      expect.objectContaining({
        inputs: { DI1: true, DI2: false, DI3: true, DI4: false, DI5: false, DI6: false, DI7: false, DI8: false },
        outputs: { DO1: false, DO2: true, DO3: false, DO4: false },
        readiness: { configurationAccepted: true, hardwareAvailable: true, ready: true, errors: [] },
        timestamp: expect.any(String),
        sequence: expect.any(Number),
      }),
    );
    const count = messages.length;
    await runtime.pollInputs();
    expect(messages).toHaveLength(count);
    await writeFile(paths.input, '7');
    await runtime.pollInputs();
    expect(state()?.inputs).toEqual(expect.objectContaining({ DI2: true }));
    expect(messages).toHaveLength(count + 1);
    await command('DO1', true);
    await writeFile(paths.output, '2');
    await runtime.pollInputs();
    expect(state()?.outputs).toEqual(expect.objectContaining({ DO1: false }));
    expect(state()?.commandedOutputs).toEqual({ DO1: true });
  });

  it('keeps acceptance separate from hardware access and recovers without publishing false inputs', async () => {
    await runtime.start();
    await rm(paths.input);
    await apply();
    expect(messages.find(({ topic }) => topic.endsWith('/configuration/reported'))?.payload.errors).toEqual([]);
    expect(state()?.readiness).toEqual(
      expect.objectContaining({ configurationAccepted: true, hardwareAvailable: false, ready: false }),
    );
    expect(state()?.inputs).toEqual({});
    expect(messages.some(({ payload }) => payload.code === 'digital_read_failed' && payload.channelId === 'DI2')).toBe(
      true,
    );
    await writeFile(paths.input, '2');
    await runtime.pollInputs();
    expect(state()?.inputs).toEqual(expect.objectContaining({ DI1: false, DI2: true }));
    expect(state()?.readiness).toEqual(expect.objectContaining({ ready: true }));
  });

  it('reports output permission failures as unavailable without attempting a write', async () => {
    jest.spyOn(adapter, 'checkAvailability').mockRejectedValue(new Error('EACCES: DOUT'));
    const write = jest.spyOn(adapter, 'write');
    await runtime.start();
    await apply();
    expect(state()?.readiness).toEqual(
      expect.objectContaining({
        ready: false,
        errors: [
          expect.objectContaining({
            code: 'hardware_unavailable',
            message: expect.stringContaining('UID permissions'),
          }),
        ],
      }),
    );
    expect(write).not.toHaveBeenCalled();
  });

  it('uses the selected input bit for guards and feedback', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    await runtime.start();
    const guarded = structuredClone(snapshot);
    guarded.logicalChannels[0].capabilities.push('guard', 'feedback');
    guarded.logicalChannels[0].guard = { channelId: 'DI2', when: 'on' };
    guarded.logicalChannels[0].feedback = { channelId: 'DI2', expected: 'match', timeoutMs: 10 };
    await apply(guarded);
    await writeFile(paths.input, '1');
    await command('DO1', true, 'blocked');
    expect(await readFile(paths.output, 'utf8')).toBe('0');
    expect(messages.at(-1)?.payload).toEqual(expect.objectContaining({ code: 'guard_rejected' }));
    await writeFile(paths.input, '2');
    await command('DO1', true, 'allowed');
    expect(await readFile(paths.output, 'utf8')).toBe('1');
    await writeFile(paths.input, '1');
    await jest.advanceTimersByTimeAsync(10);
    // Timer callbacks perform real file I/O; flush until the feedback read finishes.
    for (
      let attempt = 0;
      attempt < 100 && !messages.some(({ payload }) => payload.code === 'feedback_mismatch');
      attempt++
    )
      await new Promise<void>((resolve) => setImmediate(resolve));
    expect(messages.some(({ payload }) => payload.code === 'feedback_mismatch')).toBe(true);
  });

  it('handles concurrent runtime commands, duplicates, pulse completion and disconnect without losing other bits', async () => {
    await runtime.start();
    const pulsed = structuredClone(snapshot);
    pulsed.logicalChannels[0].capabilities.push('pulse');
    pulsed.logicalChannels[0].pulse = { durationMs: 20 };
    await apply(pulsed);
    await Promise.all([command('DO2', true), command('DO3', true), command('DO4', true)]);
    await command('DO1', true, 'pulse', 'pulse');
    await command('DO1', true, 'pulse', 'pulse');
    expect(messages.at(-1)?.payload.status).toBe('duplicate');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await readFile(paths.output, 'utf8')).toBe('14');
    await runtime.setConnected(false);
    expect(await readFile(paths.output, 'utf8')).toBe('0');
  });

  it('reserves monotonic sequences across restart and blocks commands using unsupported persisted mappings', async () => {
    await runtime.start();
    await apply();
    const previous = Number(state()?.sequence);
    const persisted = await store.load();
    if (!persisted.accepted) throw new Error('test configuration was not accepted');
    persisted.accepted.snapshot.logicalChannels[0].capabilities = ['input', 'output'];
    await store.save(persisted);
    runtime = new WagoRuntime({
      hardwareId: 'test',
      prefix: 'test',
      pairingCode: 'synthetic',
      store,
      transport,
      device: adapter,
    });
    await runtime.start();
    expect(Number(state()?.sequence)).toBeGreaterThan(previous);
    expect(state()?.readiness).toEqual(expect.objectContaining({ ready: false }));
    await command('DO1', true);
    expect(messages.at(-1)?.payload.code).toBe('unsupported_point');
    expect(await readFile(paths.output, 'utf8')).toBe('0');
  });
});
