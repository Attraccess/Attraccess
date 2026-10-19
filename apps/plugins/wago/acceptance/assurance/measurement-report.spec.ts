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
