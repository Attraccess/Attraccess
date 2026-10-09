import * as processes from 'node:child_process';

import { ModbusDeviceRouter } from '../routing/adapter';
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
  it('retains deduplication, uncertainty and quarantine after a partial production write', async () => {
    fixture.mode = 'partial-failure';
    const { runtime, store, published } = fixture.harness();
    await runtime.start();
    await runtime.receiveCommand(fixture.command(fixture.base + 10000, 'unknown'));
    expect(fixture.writes).toEqual(['010600']);
    expect(store.saved.uncertainOutputChannelIds).toEqual(['output']);
    expect(store.saved.commandIds).toContain('unknown');
    expect(published.at(-1)).toMatchObject({ status: 'rejected' });
    await runtime.receiveCommand(fixture.command(fixture.base + 10000, 'unknown'));
    expect(published.at(-1)).toMatchObject({ status: 'duplicate' });
    // Neither a fresh command nor a replacement router can reset the quarantined bus.
    await runtime.receiveCommand(fixture.command(fixture.base + 10000, 'fresh'));
    const replacement = new ModbusDeviceRouter({ read: async () => false, write: async () => undefined });
    const accepted = store.saved.accepted;
    if (!accepted) throw new Error('missing fixture configuration');
    replacement.configure(accepted.snapshot);
    await expect(replacement.write(accepted.snapshot.physicalPoints[0], false)).rejects.toMatchObject({
      code: 'modbus_rtu_quarantined',
    });
    expect(fixture.writes).toEqual(['010600']);
    expect(processes.spawn).toHaveBeenCalledTimes(1);
  });

  it('still shuts down an admitted pulse after its original command expires', async () => {
    const s = snapshot();
    s.logicalChannels[0].capabilities.push('pulse');
    s.logicalChannels[0].pulse = { durationMs: 10 };
    const { runtime, store, device } = fixture.harness(s);
    await runtime.start();
    let finished!: () => void;
    const completion = new Promise<void>((resolve) => {
      finished = resolve;
    });
    const write = device.write.bind(device);
    jest.spyOn(device, 'write').mockImplementation(async (...args) => {
      await write(...args);
      if (!args[1]) finished();
    });
    await runtime.receiveCommand(
      Buffer.from(
        JSON.stringify({
          ...JSON.parse(fixture.command(fixture.base + 1000).toString()),
          action: 'pulse',
        }),
      ),
    );
    fixture.now = fixture.base + 2000;
    await completion;
    // Let the output controller persist the successful OFF.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(fixture.writes).toEqual(['0106000c00018809', '0106000c000049c9']);
    expect(store.saved.outputs.output).toBe(false);
    expect(store.saved.pendingPulseChannelIds).toEqual([]);
  });
});
