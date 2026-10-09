import { readFile, writeFile } from 'node:fs/promises';

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

  it('does not let stalled reconnect telemetry hold pulse shutdown or disconnect writes', async () => {
    await fixture.runtime.start();
    const pulsed = structuredClone(snapshot);
    pulsed.logicalChannels[0].capabilities.push('pulse');
    pulsed.logicalChannels[0].pulse = { durationMs: 20 };
    await fixture.apply(pulsed);
    const started = deferred();
    const release = deferred();
    const publish = fixture.transport.publish.bind(fixture.transport);
    jest.spyOn(fixture.transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith('/state')) {
        started.resolve();
        await release.promise;
      }
      await publish(topic, payload, options);
    });
    await writeFile(fixture.paths.input, '1');
    const reconnect = fixture.runtime.setConnected(true);
    await started.promise;
    try {
      await reconnect;
      await fixture.command('DO1', true, 'pulse', 'pulse');
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(await readFile(fixture.paths.output, 'utf8')).toBe('0');
      await fixture.command('DO2', true);
      const writtenOff = deferred();
      const write = fixture.adapter.write.bind(fixture.adapter);
      jest.spyOn(fixture.adapter, 'write').mockImplementation(async (physical, value) => {
        await write(physical, value);
        if (physical.channel === 3 && !value) writtenOff.resolve();
      });
      const disconnect = fixture.runtime.setConnected(false);
      await writtenOff.promise;
      expect(await readFile(fixture.paths.output, 'utf8')).toBe('0');
      release.resolve();
      await disconnect;
    } finally {
      release.resolve();
    }
  });

  it('does not overwrite a configuration commit with a simultaneous sequence reservation', async () => {
    await fixture.runtime.start();
    await fixture.apply();
    for (let index = 0; index < 100; index++) await fixture.command('missing', true, `unknown-${index}`);
    expect(Number(fixture.messages.at(-1)?.payload.sequence)).toBe(100);
    const started = deferred();
    const release = deferred();
    const save = fixture.store.save.bind(fixture.store);
    let delay = true;
    jest.spyOn(fixture.store, 'save').mockImplementation(async (value) => {
      if (value.accepted?.revision === 2 && delay) {
        delay = false;
        started.resolve();
        await release.promise;
      }
      await save(value);
    });
    const applying = fixture.apply(snapshot, 2);
    await started.promise;
    const allocation = fixture.command('missing', true, 'during-commit');
    release.resolve();
    await Promise.all([applying, allocation]);
    expect((await fixture.store.load()).accepted?.revision).toBe(2);
    expect((await fixture.store.load()).sequence).toBe(200);
  });

  it('coalesces many writes behind stalled telemetry into one pending refresh', async () => {
    await fixture.runtime.start();
    await fixture.apply();
    const started = deferred();
    const release = deferred();
    const publish = fixture.transport.publish.bind(fixture.transport);
    jest.spyOn(fixture.transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith('/state')) {
        started.resolve();
        await release.promise;
      }
      await publish(topic, payload, options);
    });
    const read = jest.spyOn(fixture.adapter, 'read');
    await writeFile(fixture.paths.input, '1');
    const poll = fixture.runtime.pollInputs();
    await started.promise;
    try {
      for (let index = 0; index < 50; index++) await fixture.command('DO1', Boolean(index % 2), `write-${index}`);
      expect(read).toHaveBeenCalledTimes(12);
    } finally {
      release.resolve();
      await poll;
    }
    expect(read).toHaveBeenCalledTimes(24);
  });

  it('publishes reserved JavaScript property names as ordinary logical channel IDs', async () => {
    await fixture.runtime.start();
    const named = structuredClone(snapshot);
    named.logicalChannels[4].id = '__proto__';
    await writeFile(fixture.paths.input, '1');
    await fixture.apply(named);
    const inputs = JSON.parse(JSON.stringify(fixture.state()?.inputs));
    expect(Object.hasOwn(inputs, '__proto__')).toBe(true);
    expect(inputs['__proto__']).toBe(true);
  });

  it('does not publish old retained state after a revision commits during fault publication', async () => {
    await fixture.runtime.start();
    await fixture.apply();
    const started = deferred();
    const release = deferred();
    const committed = deferred();
    const publish = fixture.transport.publish.bind(fixture.transport);
    jest.spyOn(fixture.transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith('/faults')) {
        started.resolve();
        await release.promise;
      }
      await publish(topic, payload, options);
      if (topic.endsWith('/configuration/reported')) committed.resolve();
    });
    await writeFile(fixture.paths.input, 'invalid');
    const poll = fixture.runtime.pollInputs();
    await started.promise;
    const applying = fixture.apply(snapshot, 2);
    await committed.promise;
    const messageCount = fixture.messages.length;
    release.resolve();
    await Promise.all([poll, applying]);
    expect(
      fixture.messages
        .slice(messageCount)
        .filter(({ topic }) => topic.endsWith('/state'))
        .map(({ payload }) => payload.revision),
    ).toEqual([2]);
  });
});
