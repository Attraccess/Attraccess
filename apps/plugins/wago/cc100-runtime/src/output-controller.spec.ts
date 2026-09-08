import { OutputController } from './output-controller';
import type { RuntimeState, Snapshot } from './runtime-types';

describe('OutputController disconnect policies', () => {
  it('schedules watchdogs before a slow immediate shutdown completes', async () => {
    jest.useFakeTimers();
    try {
      const snapshot: Snapshot = {
        version: 1,
        physicalPoints: [
          { id: 'immediate-point', hardwareProfile: '751-9301', channel: 0 },
          { id: 'watchdog-point', hardwareProfile: '751-9301', channel: 1 },
        ],
        logicalChannels: [
          {
            id: 'immediate',
            physicalPointId: 'immediate-point',
            profile: 'output',
            capabilities: ['output'],
            disconnectPolicy: { mode: 'immediate' },
          },
          {
            id: 'watchdog',
            physicalPointId: 'watchdog-point',
            profile: 'output',
            capabilities: ['output'],
            disconnectPolicy: { mode: 'watchdog', timeoutMs: 10 },
          },
        ],
      };
      const state: RuntimeState = { outputs: {}, commandIds: [] };
      let releaseImmediate!: () => void;
      const immediateWrite = new Promise<void>((resolve) => {
        releaseImmediate = resolve;
      });
      const writes: string[] = [];
      const controller = new OutputController({
        device: {
          write: async (point) => {
            writes.push(point.id);
            if (point.id === 'immediate-point') await immediateWrite;
          },
          read: async () => false,
        },
        getSnapshot: () => snapshot,
        getState: () => state,
        saveState: async () => undefined,
        publishState: () => undefined,
        publishFault: async () => undefined,
      });

      const disconnect = controller.applyDisconnectPolicies(false);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(10);
      expect(writes).toEqual(['immediate-point', 'watchdog-point']);
      releaseImmediate();
      await disconnect;
    } finally {
      jest.useRealTimers();
    }
  });
});
