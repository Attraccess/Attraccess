import { rm, writeFile } from 'node:fs/promises';

import { OnboardIoFixture, deferred } from './onboard-io.test-utils';
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

  it.each(['stalled', 'rejected'])('invalidates failed input reads even when fault publication is %s', async (mode) => {
    await fixture.runtime.start();
    await writeFile(fixture.paths.input, '255');
    await fixture.apply();
    const release = deferred();
    const publish = fixture.transport.publish.bind(fixture.transport);
    jest.spyOn(fixture.transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith('/faults')) {
        if (mode === 'rejected') throw new Error('fault delivery failed');
        await release.promise;
      }
      await publish(topic, payload, options);
    });
    await writeFile(fixture.paths.input, 'invalid');
    try {
      await fixture.runtime.pollInputs();
      expect(fixture.state()?.inputs).toEqual({});
      expect(fixture.state()?.readiness).toEqual(expect.objectContaining({ ready: false }));
      await writeFile(fixture.paths.input, '2');
      await fixture.runtime.pollInputs();
      expect(fixture.state()?.inputs).toEqual(expect.objectContaining({ DI1: false, DI2: true }));
      expect(fixture.state()?.readiness).toEqual(expect.objectContaining({ ready: true }));
    } finally {
      release.resolve();
    }
  });

  it('publishes typed input changes and actual output state, not aggregate truthiness or stale commands', async () => {
    await fixture.runtime.start();
    await writeFile(fixture.paths.input, '5');
    await writeFile(fixture.paths.output, '2');
    await fixture.apply();
    expect(fixture.state()).toEqual(
      expect.objectContaining({
        inputs: { DI1: true, DI2: false, DI3: true, DI4: false, DI5: false, DI6: false, DI7: false, DI8: false },
        outputs: { DO1: false, DO2: true, DO3: false, DO4: false },
        readiness: { configurationAccepted: true, hardwareAvailable: true, ready: true, errors: [] },
        timestamp: expect.any(String),
        sequence: expect.any(Number),
      }),
    );
    const count = fixture.messages.length;
    await fixture.runtime.pollInputs();
    expect(fixture.messages).toHaveLength(count);
    await writeFile(fixture.paths.input, '7');
    await fixture.runtime.pollInputs();
    expect(fixture.state()?.inputs).toEqual(expect.objectContaining({ DI2: true }));
    expect(fixture.messages).toHaveLength(count + 1);
    await fixture.command('DO1', true);
    await writeFile(fixture.paths.output, '2');
    await fixture.runtime.pollInputs();
    expect(fixture.state()?.outputs).toEqual(expect.objectContaining({ DO1: false }));
    expect(fixture.state()?.commandedOutputs).toEqual({ DO1: true });
  });

  it('keeps acceptance separate from hardware access and recovers without publishing false inputs', async () => {
    await fixture.runtime.start();
    await rm(fixture.paths.input);
    await fixture.apply();
    expect(fixture.messages.find(({ topic }) => topic.endsWith('/configuration/reported'))?.payload.errors).toEqual([]);
    expect(fixture.state()?.readiness).toEqual(
      expect.objectContaining({ configurationAccepted: true, hardwareAvailable: false, ready: false }),
    );
    expect(fixture.state()?.inputs).toEqual({});
    expect(
      fixture.messages.some(({ payload }) => payload.code === 'digital_read_failed' && payload.channelId === 'DI2'),
    ).toBe(true);
    await writeFile(fixture.paths.input, '2');
    await fixture.runtime.pollInputs();
    expect(fixture.state()?.inputs).toEqual(expect.objectContaining({ DI1: false, DI2: true }));
    expect(fixture.state()?.readiness).toEqual(expect.objectContaining({ ready: true }));
  });

  it('reports output permission failures as unavailable without attempting a write', async () => {
    jest.spyOn(fixture.adapter, 'checkAvailability').mockRejectedValue(new Error('EACCES: DOUT'));
    const write = jest.spyOn(fixture.adapter, 'write');
    await fixture.runtime.start();
    await fixture.apply();
    expect(fixture.state()?.readiness).toEqual(
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
});
