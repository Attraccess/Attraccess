import { readFile } from 'node:fs/promises';

import { OnboardIoFixture, snapshot, deferred } from './onboard-io.test-utils';
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

  it('finishes pulse shutdown while a command acknowledgement is stalled', async () => {
    await fixture.runtime.start();
    const pulsed = structuredClone(snapshot);
    pulsed.logicalChannels[0].capabilities.push('pulse');
    pulsed.logicalChannels[0].pulse = { durationMs: 20 };
    await fixture.apply(pulsed);
    const started = deferred();
    const release = deferred();
    const publish = fixture.transport.publish.bind(fixture.transport);
    jest.spyOn(fixture.transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith('/acknowledgements')) {
        started.resolve();
        await release.promise;
      }
      await publish(topic, payload, options);
    });
    const outputs = fixture.runtime['outputs'];
    const shutdown = jest.spyOn(
      outputs as unknown as { writePulseShutdown: (typeof outputs)['writePulseShutdown'] },
      'writePulseShutdown',
    );
    const action = fixture.command('DO1', true, 'pulse', 'pulse');
    await started.promise;
    try {
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(await readFile(fixture.paths.output, 'utf8')).toBe('0');
    } finally {
      release.resolve();
      await action;
      // A cleared output precedes the asynchronous state save and publication.
      await Promise.all(shutdown.mock.results.map((result) => result.value));
      shutdown.mockRestore();
      await fixture.runtime.pollInputs();
    }
  });

  it('retries a failed pulse shutdown while its fault acknowledgement is stalled', async () => {
    await fixture.runtime.start();
    const pulsed = structuredClone(snapshot);
    pulsed.logicalChannels[0].capabilities.push('pulse');
    pulsed.logicalChannels[0].pulse = { durationMs: 20 };
    await fixture.apply(pulsed);
    const started = deferred();
    const release = deferred();
    const retried = deferred();
    const publish = fixture.transport.publish.bind(fixture.transport);
    jest.spyOn(fixture.transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith('/faults')) {
        started.resolve();
        await release.promise;
      }
      await publish(topic, payload, options);
    });
    const write = fixture.adapter.write.bind(fixture.adapter);
    let fail = true;
    jest.spyOn(fixture.adapter, 'write').mockImplementation(async (physical, value) => {
      if (!value && fail) {
        fail = false;
        throw new Error('temporary write failure');
      }
      await write(physical, value);
      if (!value) retried.resolve();
    });
    const outputs = fixture.runtime['outputs'];
    const shutdown = jest.spyOn(
      outputs as unknown as { writePulseShutdown: (typeof outputs)['writePulseShutdown'] },
      'writePulseShutdown',
    );
    await fixture.command('DO1', true, 'pulse', 'pulse');
    await started.promise;
    try {
      await retried.promise;
      expect(await readFile(fixture.paths.output, 'utf8')).toBe('0');
    } finally {
      release.resolve();
      // The adapter write finishes before the retry saves state and publishes it.
      // Drain that work before afterEach removes the simulated I/O directory.
      await Promise.all(shutdown.mock.results.map((result) => result.value));
      shutdown.mockRestore();
      await fixture.runtime.pollInputs();
    }
  });
});
