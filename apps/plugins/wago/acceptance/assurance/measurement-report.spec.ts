import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssuranceFixture } from './fixture';
import { measure } from './measurement';

const options = {
  durationSeconds: 12,
  rate: 4,
  controllers: 2,
  seed: 988,
  memoryMiB: 1024,
  maxPending: 64,
  faults: ['plugin'],
};
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'wago-report-'));
});
afterEach(async () => {
  jest.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

it('persists cumulative counters when recovery fails before the first load checkpoint', async () => {
  const fixture = new AssuranceFixture();
  jest.spyOn(fixture, 'start').mockImplementation(async () => {
    fixture.counts.received = 7;
    fixture.retiredWireRejected = 3;
    fixture.backend = {
      onModuleDestroy: jest.fn(),
      messageStatistics: { rejected: 2 },
    } as unknown as AssuranceFixture['backend'];
  });
  jest.spyOn(fixture, 'startBackend').mockRejectedValue(new Error('recovery failed'));
  jest.spyOn(fixture, 'close').mockResolvedValue();
  await expect(measure(options, directory, fixture)).rejects.toThrow('recovery failed');
  const report = JSON.parse(await readFile(join(directory, 'measurements.json'), 'utf8'));
  expect(report).toMatchObject({ outcome: 'failed', stages: [], counters: { received: 7, wireAdmissionRejected: 5 } });
  expect(report.faults).toEqual([expect.objectContaining({ name: 'plugin', passed: false })]);
});

it('flushes counters synchronously on graceful termination between checkpoints', async () => {
  const fixture = new AssuranceFixture();
  let reject!: (error: Error) => void;
  jest.spyOn(fixture, 'start').mockImplementation(
    () =>
      new Promise<void>((_resolve, failure) => {
        reject = failure;
      }),
  );
  jest.spyOn(fixture, 'close').mockResolvedValue();
  const interrupted = new Error('simulated process exit');
  const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
    throw interrupted;
  });
  const execution = measure(options, directory, fixture);
  fixture.counts.received = 19;
  fixture.retiredTransportRejected = 4;
  expect(() => process.emit('SIGTERM')).toThrow(interrupted);
  expect(exit).toHaveBeenCalledWith(143);
  const report = JSON.parse(await readFile(join(directory, 'measurements.json'), 'utf8'));
  expect(report).toMatchObject({ outcome: 'interrupted', counters: { received: 19, transportOversizedRejected: 4 } });
  expect(report.recommendation).toBeNull();
  reject(new Error('stop test'));
  await expect(execution).rejects.toThrow('stop test');
});

it.each(['connect', 'runtime'])('retains each counter once when replacement fails during %s', async (failure) => {
  const fixture = new AssuranceFixture();
  const device = {
    username: 'fixture',
    password: 'fixture',
    hardwareId: 'fixture',
    transport: { statistics: { staleDiscarded: 2, oversizedRejected: 3, acknowledgementTimeouts: 4 } },
    runtime: { messageStatistics: { rejected: 5, runtimeRejected: { parsing: 6, structure: 7, validation: 8 } } },
  } as unknown as AssuranceFixture['devices'][number];
  fixture.devices.push(device);
  const { WagoRuntime } = await import('../../cc100-runtime/src/runtime');
  jest.spyOn(WagoRuntime.prototype, 'start').mockImplementation(async function (
    this: InstanceType<typeof WagoRuntime>,
  ) {
    await this.receiveCommand(Buffer.from('{'));
    throw new Error('startup failed');
  });
  const client = { on: jest.fn() } as unknown as Awaited<ReturnType<AssuranceFixture['connect']>>;
  const connect = jest.spyOn(fixture, 'connect');
  if (failure === 'connect') connect.mockRejectedValue(new Error('startup failed'));
  else connect.mockResolvedValue(client);
  jest.spyOn(fixture, 'start').mockImplementation(() => fixture.startDevice(device));
  jest.spyOn(fixture, 'close').mockResolvedValue();
  await expect(measure(options, directory, fixture)).rejects.toThrow('startup failed');
  const report = JSON.parse(await readFile(join(directory, 'measurements.json'), 'utf8'));
  expect(report.counters).toMatchObject({
    intentionalDiscard: 2,
    transportOversizedRejected: 3,
    transportAcknowledgementTimeouts: 4,
    wireAdmissionRejected: 5,
    runtimeRejected: { parsing: failure === 'runtime' ? 7 : 6, structure: 7, validation: 8 },
  });
});

it.each(['connect', 'runtime'])(
  'reports initial startup failure during %s without losing counters',
  async (failure) => {
    const fixture = new AssuranceFixture();
    const device = {
      username: 'fixture',
      password: 'fixture',
      hardwareId: 'fixture',
    } as AssuranceFixture['devices'][number];
    const { WagoRuntime } = await import('../../cc100-runtime/src/runtime');
    jest.spyOn(WagoRuntime.prototype, 'start').mockImplementation(async function (
      this: InstanceType<typeof WagoRuntime>,
    ) {
      await this.receiveCommand(Buffer.from('{'));
      throw new Error('startup failed');
    });
    const connect = jest.spyOn(fixture, 'connect');
    if (failure === 'connect') connect.mockRejectedValue(new Error('startup failed'));
    else connect.mockResolvedValue({ on: jest.fn() } as unknown as Awaited<ReturnType<AssuranceFixture['connect']>>);
    jest.spyOn(fixture, 'start').mockImplementation(() => fixture.startDevice(device));
    jest.spyOn(fixture, 'close').mockResolvedValue();
    await expect(measure(options, directory, fixture)).rejects.toThrow('startup failed');
    expect(fixture.devices).toEqual([device]);
    const report = JSON.parse(await readFile(join(directory, 'measurements.json'), 'utf8'));
    expect(report.counters.runtimeRejected.parsing).toBe(failure === 'runtime' ? 1 : 0);
  },
);
