import { type RuntimeState } from '../runtime';
import { OutputController } from '../output-controller';

import { SerialAdmissionFixture, snapshot } from './serial-admission.test-utils';
jest.mock('node:child_process', () => ({ ...jest.requireActual('node:child_process'), spawn: jest.fn() }));
describe('RTU admission through production Python preparation (mock OS, no hardware)', () => {
  let fixture: SerialAdmissionFixture;
  beforeEach(() => {
    fixture = new SerialAdmissionFixture();
    fixture.setup();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });
  it.each(['prepare', 'silence', 'writable'])(
    'rejects ON expiring during Python %s with no transmitted bytes',
    async (stage) => {
      const { runtime, store, published } = fixture.harness();
      await runtime.start();
      fixture.onStage = async (current) => {
        if (current === stage) fixture.now = fixture.base + 11;
      };
      await runtime.receiveCommand(fixture.command(fixture.base + 10));
      expect(fixture.stages).toContain(stage);
      expect(fixture.writes).toEqual([]);
      expect(published.at(-1)).toMatchObject({ status: 'rejected', code: 'expired' });
      expect(store.saved.outputs.output).not.toBe(true);
      expect(store.saved.uncertainOutputChannelIds).toEqual([]);
      // A proven pre-send rejection must not quarantine the unused bus.
      await runtime.receiveCommand(fixture.command(fixture.base + 10000, 'fresh'));
      expect(fixture.writes).toHaveLength(1);
      expect(published.at(-1)).toMatchObject({ status: 'accepted' });
    },
  );

  it.each(['prepare', 'silence', 'writable'])(
    'cancels watchdog OFF when reconnect occurs during Python %s',
    async (stage) => {
      const s = snapshot();
      const { device } = fixture.harness(s);
      device.configure(s);
      const state: RuntimeState = { outputs: { output: true }, commandIds: [] };
      const outputs = new OutputController({
        device,
        getSnapshot: () => s,
        getState: () => state,
        saveState: async () => undefined,
        publishState: () => undefined,
        publishFault: async () => undefined,
      });
      let finished!: () => void;
      const completion = new Promise<void>((resolve) => {
        finished = resolve;
      });
      const write = device.write.bind(device);
      jest.spyOn(device, 'write').mockImplementation(async (...args) => {
        try {
          await write(...args);
        } finally {
          finished();
        }
      });
      fixture.onStage = async (current) => {
        if (current === stage) await outputs.applyDisconnectPolicies(true);
      };
      await outputs.applyDisconnectPolicies(false);
      await completion;
      expect(fixture.stages).toContain(stage);
      expect(fixture.writes).toEqual([]);
      expect(state.outputs.output).toBe(true);
    },
  );

  it('checks absolute expiry in Python even if delivery of the grant is delayed', async () => {
    fixture.mode = 'late-grant';
    const { runtime, store, published } = fixture.harness();
    await runtime.start();
    // Node still sees a valid command; the Python clock advances beyond it after admission.
    await runtime.receiveCommand(fixture.command(fixture.base + 1000));
    expect(fixture.stages).toContain('grant-delay');
    expect(fixture.writes).toEqual([]);
    expect(published.at(-1)).toMatchObject({ status: 'rejected', code: 'expired' });
    expect(store.saved.uncertainOutputChannelIds).toEqual([]);
  });
});
