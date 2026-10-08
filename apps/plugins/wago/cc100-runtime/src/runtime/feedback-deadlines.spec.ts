import { MemoryDeviceAdapter } from '../adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot } from '../runtime';
import { TestTransport, snapshot, desired, commands, validCommand, createRuntimeFixture } from '../runtime.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });
  it('reports a feedback mismatch after the configured feedback timeout', async () => {
    const monitored: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-monitored-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          id: 'load',
          physicalPointId: 'output-1',
          profile: 'generic-digital-output',
          capabilities: ['output', 'feedback'],
          disconnectPolicy: { mode: 'immediate' },
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    const outputs = runtime['outputs'];
    const verification = jest.spyOn(
      outputs as unknown as { verifyFeedback: (typeof outputs)['verifyFeedback'] },
      'verifyFeedback',
    );
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
      await jest.advanceTimersByTimeAsync(10);
      expect(verification).toHaveBeenCalledTimes(1);
      await verification.mock.results[0].value;

      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
          payload: expect.objectContaining({
            channelId: 'load',
            code: 'feedback_mismatch',
            timestamp: expect.any(String),
            sequence: expect.any(Number),
          }),
        }),
      );
    } finally {
      verification.mockRestore();
      jest.useRealTimers();
    }
  });

  it.each([false, true])(
    'verifies final OFF feedback %s while pulse shutdown persistence is pending',
    async (feedback) => {
      const monitored: Snapshot = {
        ...snapshot,
        physicalPoints: [...snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
        logicalChannels: [
          {
            id: 'feedback',
            physicalPointId: 'input-1',
            profile: 'generic-monitored-input',
            capabilities: ['input'],
            disconnectPolicy: { mode: 'hold' },
          },
          {
            id: 'load',
            physicalPointId: 'output-1',
            profile: 'pulsed-lock-bank',
            capabilities: ['output', 'pulse', 'feedback'],
            disconnectPolicy: { mode: 'immediate' },
            pulse: { durationMs: 5 },
            feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 15 },
          },
        ],
      };
      const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
      runtime = new WagoRuntime({
        pairingCode: 'fixture',
        hardwareId: 'cc100-1',
        prefix: 'attraccess/wago',
        store,
        transport,
        device,
      });
      await runtime.start();
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(monitored),
        snapshot: monitored,
      });
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let entered!: () => void;
      const shutdownSaving = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let completed!: () => void;
      const shutdownPublished = new Promise<void>((resolve) => {
        completed = resolve;
      });
      const persist = store.save.bind(store);
      jest.spyOn(store, 'save').mockImplementation(async (state) => {
        if (state.outputs.load === false) {
          entered();
          await held;
        }
        await persist(state);
      });
      const publish = transport.publish.bind(transport);
      jest.spyOn(transport, 'publish').mockImplementation(async (topic, payload, options) => {
        await publish(topic, payload, options);
        if (topic.endsWith('/state')) {
          const report = payload as { outputs?: Record<string, boolean> };
          if (report.outputs?.load === false) completed();
        }
      });
      jest.useFakeTimers();
      try {
        await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'pulse' }));
        await jest.advanceTimersByTimeAsync(5);
        await shutdownSaving;
        expect(device.values.get('751-9301:0')).toBe(false);
        const read = jest.spyOn(device, 'read');
        // The old ON deadline expires while the confirmed OFF is still waiting for disk.
        await jest.advanceTimersByTimeAsync(10);
        expect(read).not.toHaveBeenCalled();
        expect(transport.published).not.toContainEqual(
          expect.objectContaining({
            topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
            payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
          }),
        );
        device.values.set('751-9301:1', feedback);
        await jest.advanceTimersByTimeAsync(5);
        expect(read).toHaveBeenCalledWith(monitored.physicalPoints[1]);
        const faults = transport.published.filter((entry) => entry.topic.endsWith('/faults'));
        expect(faults).toEqual(
          feedback
            ? [
                expect.objectContaining({
                  payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
                }),
              ]
            : [],
        );
      } finally {
        release();
        await shutdownPublished;
        jest.useRealTimers();
      }
    },
  );
});
