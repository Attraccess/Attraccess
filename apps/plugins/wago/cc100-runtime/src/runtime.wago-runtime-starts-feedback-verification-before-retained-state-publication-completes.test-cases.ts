import { JsonStateStore, WagoRuntime, hash, type Snapshot, type Transport } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeStartsFeedbackVerificationBeforeRetainedStatePublicationCompletes(
  scope: WagoRuntimeTestScope,
): void {
  it('starts feedback verification before retained-state publication completes', async () => {
    jest.useFakeTimers();
    const monitored: Snapshot = {
      ...scope.snapshot,
      physicalPoints: [...scope.snapshot.physicalPoints, { id: 'input-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'feedback',
          physicalPointId: 'input-1',
          profile: 'generic-digital-input',
          capabilities: ['input'],
          disconnectPolicy: { mode: 'hold' },
        },
        {
          ...scope.snapshot.logicalChannels[0],
          capabilities: ['output', 'feedback'],
          pulse: undefined,
          feedback: { channelId: 'feedback', expected: 'match', timeoutMs: 5 },
        },
      ],
    };
    let delayStatePublication = false;
    let releaseStatePublication!: () => void;
    let statePublicationStarted!: () => void;
    const statePublication = new Promise<void>((resolve) => {
      releaseStatePublication = resolve;
    });
    const startedStatePublication = new Promise<void>((resolve) => {
      statePublicationStarted = resolve;
    });
    const delayedTransport: Transport = {
      publish: async (topic, payload, options) => {
        if (delayStatePublication && topic.endsWith('/state')) {
          statePublicationStarted();
          await statePublication;
        }
        await scope.transport.publish(topic, payload, options);
      },
      subscribe: async (topic, listener) => scope.transport.subscribe(topic, listener),
    };
    scope.runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: delayedTransport,
      device: scope.device,
    });
    await scope.runtime.start();
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(monitored),
      snapshot: monitored,
    });
    delayStatePublication = true;

    try {
      const command = scope.transport.send(scope.commands, scope.validCommand());
      await startedStatePublication;
      await jest.advanceTimersByTimeAsync(10);

      expect(scope.transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
          payload: expect.objectContaining({ channelId: 'load', code: 'feedback_mismatch' }),
        }),
      );
      releaseStatePublication();
      await command;
    } finally {
      releaseStatePublication();
      jest.useRealTimers();
    }
  });
}
