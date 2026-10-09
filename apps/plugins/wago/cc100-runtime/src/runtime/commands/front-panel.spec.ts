import { hash, validateSnapshot, type RuntimeState, type Snapshot } from '../../runtime';
import { FrontPanelFixture, snapshot } from './front-panel.test-utils';

describe('front panel runtime', () => {
  let fixture: FrontPanelFixture;
  beforeEach(async () => {
    fixture = new FrontPanelFixture();
    await fixture.setup();
  });

  it('publishes inverted inputs and rejects inversion on output channels', () => {
    expect(fixture.state.inputs).toEqual({ input: true });
    expect(
      validateSnapshot({ ...snapshot, logicalChannels: [{ ...snapshot.logicalChannels[0], invert: true }] }),
    ).toContainEqual(expect.objectContaining({ code: 'invalid_invert' }));
  });

  it('persists manual ownership and lets a subsequent flow command take over', async () => {
    const commits: RuntimeState[] = [];
    jest.spyOn(fixture.store, 'save').mockImplementation(async (value) => {
      fixture.persisted = structuredClone(value);
      commits.push(fixture.persisted);
    });
    await fixture.runtime.receiveCommand(fixture.command({ source: 'manual' }));
    await fixture.runtime.publishHeartbeat();
    expect(fixture.persisted.manualOutputChannelIds).toEqual(['output']);
    expect(fixture.state.manualOutputChannelIds).toEqual(['output']);
    expect(commits.filter((value) => value.outputs.output)).not.toEqual([]);
    for (const value of commits.filter((value) => value.outputs.output))
      expect(value.manualOutputChannelIds).toEqual(['output']);
    commits.length = 0;
    await fixture.runtime.receiveCommand(fixture.command({ value: false }));
    await fixture.runtime.publishHeartbeat();
    expect(fixture.persisted.manualOutputChannelIds).toEqual([]);
    expect(fixture.state.manualOutputChannelIds).toEqual([]);
    expect(fixture.state.outputs).toEqual({ output: false });
    expect(commits.filter((value) => value.outputs.output === false)).not.toEqual([]);
    for (const value of commits.filter((value) => value.outputs.output === false))
      expect(value.manualOutputChannelIds).toEqual([]);
  });

  it('releases ownership without writing hardware and rejects release against a stale revision', async () => {
    await fixture.runtime.receiveCommand(fixture.command({ source: 'manual' }));
    const writes = jest.spyOn(fixture.device, 'write');
    await fixture.runtime.receiveCommand(
      fixture.command({ source: 'manual', action: 'release', expectedConfigurationRevision: 2 }),
    );
    expect(fixture.acknowledgements.at(-1)).toMatchObject({ status: 'rejected', code: 'stale_revision' });
    expect(fixture.persisted.manualOutputChannelIds).toEqual(['output']);
    await fixture.runtime.receiveCommand(fixture.command({ source: 'manual', action: 'release' }));
    await fixture.runtime.publishHeartbeat();
    expect(writes).not.toHaveBeenCalled();
    expect(fixture.state.outputs).toEqual({ output: true });
    expect(fixture.state.manualOutputChannelIds).toEqual([]);
  });

  it('keeps output and manual ownership together when durable output persistence fails', async () => {
    const previousOutputs = structuredClone(fixture.persisted.outputs);
    const attempted: RuntimeState[] = [];
    jest.spyOn(fixture.store, 'save').mockImplementation(async (value) => {
      const next = structuredClone(value);
      if (next.outputs.output) {
        attempted.push(next);
        throw new Error('disk unavailable');
      }
      fixture.persisted = next;
    });
    await expect(fixture.runtime.receiveCommand(fixture.command({ source: 'manual' }))).rejects.toThrow(
      'failed to persist channel state',
    );
    expect(attempted).not.toEqual([]);
    for (const value of attempted) expect(value.manualOutputChannelIds).toEqual(['output']);
    expect(fixture.persisted.outputs).toEqual(previousOutputs);
    expect(fixture.acknowledgements).not.toContainEqual(expect.objectContaining({ status: 'accepted' }));
  });

  it('preserves manual ownership when a flow hardware write fails', async () => {
    await fixture.runtime.receiveCommand(fixture.command({ source: 'manual' }));
    jest.spyOn(fixture.device, 'write').mockRejectedValueOnce(new Error('relay unavailable'));
    await fixture.runtime.receiveCommand(fixture.command({ value: false }));
    expect(fixture.acknowledgements.at(-1)).toMatchObject({ status: 'rejected' });
    expect(fixture.persisted.outputs).toEqual({ output: true });
    expect(fixture.persisted.manualOutputChannelIds).toEqual(['output']);
  });

  it('commits pulse ownership with output state and preserves it during automatic shutoff', async () => {
    jest.useFakeTimers();
    try {
      const pulseSnapshot: Snapshot = {
        ...snapshot,
        logicalChannels: [
          { ...snapshot.logicalChannels[0], capabilities: ['output', 'pulse'], pulse: { durationMs: 1000 } },
          snapshot.logicalChannels[1],
        ],
      };
      await fixture.runtime.receiveDesired(
        Buffer.from(
          JSON.stringify({
            protocolVersion: 1,
            revision: 2,
            contentHash: hash(pulseSnapshot),
            snapshot: pulseSnapshot,
          }),
        ),
      );
      const commits: RuntimeState[] = [];
      jest.spyOn(fixture.store, 'save').mockImplementation(async (value) => {
        fixture.persisted = structuredClone(value);
        commits.push(fixture.persisted);
      });
      await fixture.runtime.receiveCommand(
        fixture.command({ source: 'manual', action: 'pulse', expectedConfigurationRevision: 2 }),
      );
      expect(fixture.acknowledgements.at(-1)).toMatchObject({ status: 'accepted' });
      expect(commits.filter((value) => value.outputs.output)).not.toEqual([]);
      for (const value of commits.filter((value) => value.outputs.output))
        expect(value.manualOutputChannelIds).toEqual(['output']);
      await jest.advanceTimersByTimeAsync(1000);
      expect(fixture.persisted.outputs).toEqual({ output: false });
      expect(fixture.persisted.manualOutputChannelIds).toEqual(['output']);
      commits.length = 0;
      await fixture.runtime.receiveCommand(fixture.command({ action: 'pulse', expectedConfigurationRevision: 2 }));
      expect(commits.filter((value) => value.outputs.output)).not.toEqual([]);
      for (const value of commits.filter((value) => value.outputs.output))
        expect(value.manualOutputChannelIds).toEqual([]);
      await jest.advanceTimersByTimeAsync(1000);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('rejects release commands without a manual source', async () => {
    await fixture.runtime.receiveCommand(fixture.command({ action: 'release' }));
    expect(fixture.acknowledgements.at(-1)).toMatchObject({ status: 'rejected', code: 'invalid_command' });
  });
});
