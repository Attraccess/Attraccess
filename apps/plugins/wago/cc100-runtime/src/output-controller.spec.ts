import { OutputController } from './output-controller';
import { WriteAdmissionError, type RuntimeState, type Snapshot } from './runtime-types';

const snapshot: Snapshot = {
  version: 1,
  physicalPoints: [0, 1].map((channel) => ({ id: `point-${channel}`, hardwareProfile: '751-9301', channel })),
  logicalChannels: [0, 1].map((channel) => ({
    id: `channel-${channel}`,
    physicalPointId: `point-${channel}`,
    profile: 'generic-digital-output',
    capabilities: ['output', 'pulse'],
    pulse: { durationMs: 60_000 },
    disconnectPolicy: { mode: 'immediate' },
  })),
};

describe('captured pulse shutdown obligations', () => {
  afterEach(() => jest.useRealTimers());

  it.each(['success', 'write-failure', 'save-failure'])(
    'preserves another channel started during a %s shutdown',
    async (outcome) => {
      jest.useFakeTimers();
      const state: RuntimeState = { outputs: {}, commandIds: [] };
      let release!: () => void;
      let started!: () => void;
      const writing = new Promise<void>((resolve) => {
        started = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      let failSave = false;
      const outputs = new OutputController({
        getState: () => state,
        getSnapshot: () => snapshot,
        saveState: async () => {
          if (failSave) {
            failSave = false;
            throw new Error('disk');
          }
        },
        publishState: jest.fn(),
        publishFault: jest.fn().mockResolvedValue(undefined),
        device: {
          read: async () => false,
          write: async (point, value) => {
            if (point.channel === 0 && !value) {
              started();
              await pending;
              if (outcome === 'write-failure') throw new Error('bus');
            }
          },
        },
      });
      await outputs.writeWhileQueued(snapshot.logicalChannels[0], true, undefined, undefined, undefined, 10);
      outputs.schedulePulse(snapshot.logicalChannels[0], 10);
      await jest.advanceTimersByTimeAsync(10);
      await writing;
      await outputs.writeWhileQueued(snapshot.logicalChannels[1], true, undefined, undefined, undefined, 60_000);
      outputs.schedulePulse(snapshot.logicalChannels[1], 60_000);
      failSave = outcome === 'save-failure';
      release();
      await jest.advanceTimersByTimeAsync(0);
      expect(state.pendingPulseRoutes?.map((route) => route.channel.id).sort()).toEqual(
        outcome === 'success' ? ['channel-1'] : ['channel-0', 'channel-1'],
      );
      expect(state.pendingPulseChannelIds).toContain('channel-1');
      jest.clearAllTimers();
    },
  );

  it('preserves another pulse when an in-flight command is rejected before transmission', async () => {
    const state: RuntimeState = { outputs: {}, commandIds: [] };
    let release!: () => void;
    let started!: () => void;
    const writing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const outputs = new OutputController({
      getState: () => state,
      getSnapshot: () => snapshot,
      saveState: async () => undefined,
      publishState: jest.fn(),
      publishFault: jest.fn().mockResolvedValue(undefined),
      device: {
        read: async () => false,
        write: async (point) => {
          if (point.channel === 0) {
            started();
            await pending;
            throw new WriteAdmissionError('expired');
          }
        },
      },
    });
    const first = outputs.runForChannel('channel-0', () =>
      outputs.writeWhileQueued(snapshot.logicalChannels[0], true, undefined, undefined, undefined, 10),
    );
    const rejected = expect(first).rejects.toThrow('command has expired');
    await writing;
    await outputs.runForChannel('channel-1', () =>
      outputs.writeWhileQueued(snapshot.logicalChannels[1], true, undefined, undefined, undefined, 60_000),
    );
    release();
    await rejected;
    expect(state.pendingPulseRoutes?.map((route) => route.channel.id)).toEqual(['channel-1']);
    expect(state.pendingPulseChannelIds).toEqual(['channel-1']);
  });

  it('immediately shuts down captured routes removed from the active snapshot during runtime failsafe', async () => {
    jest.useFakeTimers();
    const state: RuntimeState = { outputs: {}, commandIds: [] };
    let active = snapshot;
    const write = jest.fn().mockResolvedValue(undefined);
    const outputs = new OutputController({
      getState: () => state,
      getSnapshot: () => active,
      saveState: async () => undefined,
      publishState: jest.fn(),
      publishFault: jest.fn().mockResolvedValue(undefined),
      device: { read: async () => false, write },
    });
    await outputs.writeWhileQueued(snapshot.logicalChannels[0], true, undefined, undefined, undefined, 60_000);
    outputs.schedulePulse(snapshot.logicalChannels[0], 60_000);
    active = { version: 1, physicalPoints: [], logicalChannels: [] };
    await outputs.applyRuntimeUpdateFailsafe();
    expect(write).toHaveBeenLastCalledWith(snapshot.physicalPoints[0], false);
    expect(state.pendingPulseRoutes).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
    jest.clearAllTimers();
  });
});
