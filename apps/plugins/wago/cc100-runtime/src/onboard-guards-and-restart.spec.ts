import { readFile, writeFile } from 'node:fs/promises';

import { WagoRuntime } from './runtime';
import { OnboardIoFixture, snapshot } from './onboard-io.test-utils';
jest.mock('node:fs/promises', () => ({ __esModule: true, ...jest.requireActual('node:fs/promises') }));
describe('CC100 packed digital I/O', () => {
  let fixture: OnboardIoFixture;
  beforeEach(async () => {
    fixture = new OnboardIoFixture();
    await fixture.setup();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it('uses the selected input bit for guards and feedback', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    await fixture.runtime.start();
    const guarded = structuredClone(snapshot);
    guarded.logicalChannels[0].capabilities.push('guard', 'feedback');
    guarded.logicalChannels[0].guard = { channelId: 'DI2', when: 'on' };
    guarded.logicalChannels[0].feedback = { channelId: 'DI2', expected: 'match', timeoutMs: 10 };
    await fixture.apply(guarded);
    await writeFile(fixture.paths.input, '1');
    await fixture.command('DO1', true, 'blocked');
    expect(await readFile(fixture.paths.output, 'utf8')).toBe('0');
    expect(fixture.messages.at(-1)?.payload).toEqual(expect.objectContaining({ code: 'guard_rejected' }));
    await writeFile(fixture.paths.input, '2');
    await fixture.command('DO1', true, 'allowed');
    expect(await readFile(fixture.paths.output, 'utf8')).toBe('1');
    await writeFile(fixture.paths.input, '1');
    const publish = fixture.transport.publish;
    const feedback = new Promise<void>((resolve) => {
      jest.spyOn(fixture.transport, 'publish').mockImplementation(async (...args) => {
        await publish(...args);
        if ((args[1] as { code?: string }).code === 'feedback_mismatch') resolve();
      });
    });
    await jest.advanceTimersByTimeAsync(10);
    // Wait for the actual file-I/O completion event. A fixed number of event-loop
    // spins can finish before the filesystem callback on a busy CI runner.
    await feedback;
    expect(fixture.messages.some(({ payload }) => payload.code === 'feedback_mismatch')).toBe(true);
  });

  it('handles concurrent runtime commands, duplicates, pulse completion and disconnect without losing other bits', async () => {
    await fixture.runtime.start();
    const pulsed = structuredClone(snapshot);
    pulsed.logicalChannels[0].capabilities.push('pulse');
    pulsed.logicalChannels[0].pulse = { durationMs: 20 };
    await fixture.apply(pulsed);
    await Promise.all([fixture.command('DO2', true), fixture.command('DO3', true), fixture.command('DO4', true)]);
    await fixture.command('DO1', true, 'pulse', 'pulse');
    await fixture.command('DO1', true, 'pulse', 'pulse');
    expect(fixture.messages.at(-1)?.payload.status).toBe('duplicate');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await readFile(fixture.paths.output, 'utf8')).toBe('14');
    await fixture.runtime.setConnected(false);
    expect(await readFile(fixture.paths.output, 'utf8')).toBe('0');
  });

  it('starts a new sequence stream across restart and blocks commands using unsupported persisted mappings', async () => {
    await fixture.runtime.start();
    await fixture.apply();
    const previousStream = fixture.state()?.streamId;
    const persisted = await fixture.store.load();
    if (!persisted.accepted) throw new Error('test configuration was not accepted');
    persisted.accepted.snapshot.logicalChannels[0].capabilities = ['input', 'output'];
    await fixture.store.save(persisted);
    fixture.runtime = new WagoRuntime({
      hardwareId: 'test',
      prefix: 'test',
      pairingCode: 'synthetic',
      store: fixture.store,
      transport: fixture.transport,
      device: fixture.adapter,
    });
    await fixture.runtime.start();
    expect(Number(fixture.state()?.sequence)).toBe(1);
    expect(fixture.state()?.streamId).not.toBe(previousStream);
    expect(fixture.state()?.readiness).toEqual(expect.objectContaining({ ready: false }));
    await fixture.command('DO1', true);
    expect(fixture.messages.at(-1)?.payload.code).toBe('unsupported_point');
    expect(await readFile(fixture.paths.output, 'utf8')).toBe('0');
  });
});
