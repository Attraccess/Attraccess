/* eslint-disable @nx/enforce-module-boundaries -- Acceptance deliberately connects the standalone runtime, plugin and real host graph executor. */
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import 'reflect-metadata';
import { parseOperationalMessage } from '../backend/protocol/index';
import { hash } from './../cc100-runtime/src/runtime';
import { FleetAfterAll } from './production-fleet-afterall.test-utils';
import { FleetBeforeAll } from './production-fleet-beforeall.test-utils';
import { FleetFixtureState } from './production-fleet-fixture.test-utils';
import { base, delay, eventually, hardwareId, prefix, required } from './production-fleet-globals.test-utils';

describe('production fleet acceptance — RabbitMQ / packed-register / Modbus TCP fixtures, NOT hardware qualification', () => {
  const state = new FleetFixtureState();
  beforeAll(() => FleetBeforeAll(state));

  afterAll(() => FleetAfterAll(state));
  it('routes canonical DI1 through the production graph and waits for the correlated production acknowledgement', async () => {
    state.graph('input', 'input', 'state', true, 'input-load');
    state.holdAcknowledgement = true;
    await writeFile(state.din, '1');
    await state.runtime.pollInputs();
    await eventually(() => expect(state.heldAcknowledgement).toBeDefined());
    const command = required(state.wire('commands').at(-1));
    expect(command.body).toMatchObject({ channelId: 'input-load', value: true, expectedConfigurationRevision: 1 });
    expect(Date.parse(command.body.expiresAt)).toBeGreaterThan(Date.now());
    expect((required(state.heldAcknowledgement).payload as Record<string, unknown>).id).toBe(command.body.id);
    expect(await readFile(state.dout, 'utf8')).toBe('9');
    expect(state.completed('input-1').at(-1)?.payload?.().output.wago).toMatchObject({ value: true, available: true });
    expect(state.completed('input-2').at(-1)?.payload?.().output.wago).toMatchObject({ value: true, available: true });
    expect(state.completed('input-3')).toHaveLength(0);
    // A wrong ID traverses RabbitMQ/backend but must not finish the command node.
    const wrongId = randomUUID();
    await state.observer.publishAsync(
      `${base}/acknowledgements`,
      JSON.stringify({ ...(required(state.heldAcknowledgement).payload as object), id: wrongId }),
      { qos: 1 },
    );
    await eventually(() => expect(state.processedAcknowledgements.has(wrongId)).toBe(true));
    // Drain promise continuations from the processed acknowledgement, including
    // command-node completion, without a timing-based negative assertion window.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(state.completed('input-3')).toHaveLength(0);
    state.holdAcknowledgement = false;
    await required(state.heldAcknowledgement).release();
    state.heldAcknowledgement = undefined;
    await eventually(() => expect(state.completed('input-3').length).toBeGreaterThan(0));
    const stateMessage = required(state.wire('state').find((message) => message.body.inputs?.input === true));
    expect(parseOperationalMessage(prefix, stateMessage.topic, stateMessage.payload)).toMatchObject({
      hardwareId: hardwareId,
      message: { category: 'state', inputs: { input: true }, revision: 1, contentHash: hash(state.snapshot) },
    });
    expect(
      state
        .wire('acknowledgements')
        .some((message) => message.body.id === command.body.id && message.body.status === 'accepted'),
    ).toBe(true);
    // Stop matching subsequent full snapshots before building the meter graph.
    state.nodes.splice(0);
    state.edges.splice(0);
    expect(state.errors).toEqual([]);
  });

  it('acquires fractional Modbus power, reads then asynchronously waits in the real graph, and writes DO2', async () => {
    state.graph('meter', 'power', 'measurement', 13625, 'meter-load');
    await state.runtime.publishMeasurements();
    await eventually(() => expect(state.completed('meter-1')).toHaveLength(1));
    const first = required(state.wire('measurements').at(-1));
    expect(first.body).toMatchObject({ channelId: 'power', value: 12375, unit: 'milliwatt', kind: 'live' });
    expect(parseOperationalMessage(prefix, first.topic, first.payload)).toMatchObject({
      hardwareId: hardwareId,
      message: { category: 'measurement', value: 12375, unit: 'milliwatt', kind: 'live' },
    });
    expect(state.completed('meter-1')[0].payload?.().output.wago).toMatchObject({ value: 12375, available: true });
    expect(state.completed('meter-2')).toHaveLength(0);
    const before = state.wire('commands').length;
    expect(await readFile(state.dout, 'utf8')).toBe('9');
    state.modbusRaw = 13.625;
    await delay(110); // Cross the actual adapter poll interval, not a mocked clock.
    await state.runtime.publishMeasurements();
    await eventually(() => expect(state.completed('meter-3').length).toBeGreaterThan(0));
    expect(state.modbusRequests).toHaveLength(2);
    expect(required(state.wire('measurements').at(-1)).body).toMatchObject({
      value: 13625,
      unit: 'milliwatt',
      streamId: first.body.streamId,
    });
    expect(required(state.wire('measurements').at(-1)).body.sequence).toBeGreaterThan(first.body.sequence);
    expect(state.wire('commands').length).toBeGreaterThan(before);
    expect(await readFile(state.dout, 'utf8')).toBe('11'); // DO1 + DO2, preserving DO4.
    const command = required(state.wire('commands').find((message) => message.body.channelId === 'meter-load'));
    expect(
      state
        .wire('acknowledgements')
        .some((message) => message.body.id === command.body.id && message.body.status === 'accepted'),
    ).toBe(true);
    state.nodes.splice(0);
    state.edges.splice(0);
    await eventually(() =>
      expect(state.flow.payload(required(state.flow.read(state.query('meter-load'))))).toMatchObject({
        value: true,
        available: true,
      }),
    );
    expect(state.errors).toEqual([]);
  });

  it('rejects captured duplicate/out-of-order telemetry and deduplicates an actual command without rewriting its output', async () => {
    await delay(100); // Let already-running graph dispatches finish.
    state.graph('replay', 'power', 'measurement', 13625, 'meter-load');
    const latest = required(state.flow.read(state.query('power', 'measurement')));
    const measurements = state.wire('measurements');
    const starts = state.logs.filter((log) => log.type === 'flow.start').length;
    const commands = state.wire('commands').length;
    const warningsBefore = state.warnings.length;
    for (const message of [required(measurements.at(-1)), measurements[0]])
      await state.observer.publishAsync(message.topic, message.payload, { qos: 1 });
    await eventually(() =>
      expect(
        state.warnings.slice(warningsBefore).filter((message) => message.includes('duplicate or out-of-order')).length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(state.flow.read(state.query('power', 'measurement'))).toBe(latest);
    expect(state.logs.filter((log) => log.type === 'flow.start')).toHaveLength(starts);
    expect(state.wire('commands')).toHaveLength(commands);
    state.nodes.splice(0);
    state.edges.splice(0);
    const command = required(state.wire('commands').find((message) => message.body.channelId === 'meter-load'));
    // External fixture reset makes a repeated physical write observable.
    await writeFile(state.dout, '9');
    await state.observer.publishAsync(command.topic, command.payload, { qos: 1 });
    await eventually(() =>
      expect(
        state
          .wire('acknowledgements')
          .some((message) => message.body.id === command.body.id && message.body.status === 'duplicate'),
      ).toBe(true),
    );
    expect(await readFile(state.dout, 'utf8')).toBe('9');
    expect(JSON.parse(await readFile(state.statePath, 'utf8')).commandIds).toContain(command.body.id);
    expect(state.errors).toEqual([]);
  });

  it.each(['expired', 'wrong-revision'])(
    'rejects %s commands on the real runtime without changing packed output',
    async (reason) => {
      const command = {
        id: randomUUID(),
        channelId: 'meter-load',
        action: 'set',
        value: true,
        expectedConfigurationRevision: reason === 'wrong-revision' ? 2 : 1,
        expiresAt: new Date(Date.now() + (reason === 'expired' ? -1000 : 60_000)).toISOString(),
      };
      const before = await readFile(state.dout, 'utf8');
      await state.observer.publishAsync(`${base}/commands`, JSON.stringify(command), { qos: 1 });
      await eventually(() =>
        expect(
          state
            .wire('acknowledgements')
            .some((message) => message.body.id === command.id && message.body.status === 'rejected'),
        ).toBe(true),
      );
      expect(await readFile(state.dout, 'utf8')).toBe(before);
      expect(state.errors).toEqual([]);
    },
  );

  it('marks unchanged production samples stale and refuses to satisfy a wait after their freshness window', async () => {
    const sample = required(state.flow.read(state.query('power', 'measurement')));
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 90_001);
    try {
      expect(state.flow.payload(sample)).toMatchObject({ available: false, stale: true, connectionStale: true });
      await expect(
        state.flow.wait({ ...state.query('power', 'measurement'), equals: 13625, timeoutMs: 30 }),
      ).resolves.toBeNull();
    } finally {
      clock.mockRestore();
    }
    expect(state.errors).toEqual([]);
  });
});
