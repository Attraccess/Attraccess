import { registerApiLogDestinationsOnInstalledNest11Fixture } from './routed-logger.api-log-destinations-on-installed-nest-11.test-fixture';
import fs, { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileDriver } from './log-destinations';
import { logDestinationsSchema } from './logging.config';
import { once } from 'node:events';
import { format } from 'winston';

export function registerCompletesShutdownWhenADriverFinalizerFailsSynchronouslySCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
  it.each(['throw', 'event'])('completes shutdown when a driver finalizer fails synchronously (%s)', async (mode) => {
    const broken = new fixture.RecordingTransport();
    broken._final = () => {
      if (mode === 'throw') throw new Error('flush failed');
      broken.emit('error', new Error('flush failed'));
    };
    const healthy = new fixture.RecordingTransport();
    const emergency = jest.fn();
    const logger = fixture.create(
      { LOG_DESTINATIONS: 'broken,healthy' },
      { broken: fixture.driver(broken), healthy: fixture.driver(healthy) },
      emergency,
    );
    logger.log('pending');
    await logger.close();
    expect(healthy.entries).toHaveLength(1);
    expect(healthy.closeSpy).toHaveBeenCalledTimes(1);
    expect(emergency).toHaveBeenCalledTimes(1);
  });
}

export function registerDefaultsFileOutputToTheStorageRootSCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
  it.each(['default', 'relative', 'absolute'])('defaults file output to the storage root (%s)', async (kind) => {
    const storageRoot =
      kind === 'default'
        ? undefined
        : kind === 'relative'
          ? 'custom-storage'
          : join(fixture.directory, 'custom-storage');
    const logger = fixture.create({ LOG_DESTINATIONS: 'file', STORAGE_ROOT: storageRoot });
    logger.log('storage-default-entry');
    await logger.close();
    expect(readFileSync(resolve(fixture.directory, storageRoot ?? 'storage', 'api.log'), 'utf8')).toContain(
      'storage-default-entry',
    );
  });
}

export function registerDefaultsToConsoleNormalizesDeduplicatesDestinationsAndIgnoresUnselectedFileCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
  it('defaults to console, normalizes/deduplicates destinations and ignores unselected file options', async () => {
    expect(logDestinationsSchema.parse(undefined)).toEqual(['console']);
    const console = new fixture.RecordingTransport();
    const configure = jest.fn(() => () => console);
    const logger = fixture.create(
      { LOG_DESTINATIONS: ' Console,console, CONSOLE ', LOG_FILE_PATH: '\0' },
      {
        console: { configure },
        file: fileDriver,
      },
    );
    logger.log('once');
    await logger.close();
    expect(configure).toHaveBeenCalledTimes(1);
    expect(console.entries.map((entry) => entry.message)).toEqual(['once']);
    expect(console.closeSpy).toHaveBeenCalledTimes(1);
  });
}

export function registerDoesNotBufferIndefinitelyOrThrowWhenAllDestinationsFailCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
  it('does not buffer indefinitely or throw when all destinations fail', async () => {
    const broken = new fixture.RecordingTransport();
    const logger = fixture.create({ LOG_DESTINATIONS: 'broken' }, { broken: fixture.driver(broken) });
    broken.emit('error', new Error('unavailable'));
    for (let i = 0; i < 100; i++) logger.error('no destination');
    await logger.close();
    expect(broken.entries).toEqual([]);
  });
}

export function registerFansOutOnceToConsoleAndFileCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
  it('fans out once to console and file', async () => {
    const { stdout } = fixture.captureOutput();
    const logger = fixture.create({ LOG_DESTINATIONS: 'console,file,file', LOG_FILE_PATH: 'api.log' });
    logger.log('unique-message', 'Fanout');
    await logger.close();
    expect(stdout.join('').match(/unique-message/g)).toHaveLength(1);
    expect(readFileSync(join(fixture.directory, 'api.log'), 'utf8').match(/unique-message/g)).toHaveLength(1);
  });
}

export function registerForwardsAFileWriteStreamRuntimeErrorAndContinuesHealthyDeliveryWithoutRepCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
  it('forwards a file write-stream runtime error and continues healthy delivery without repeated diagnostics', async () => {
    const filename = join(fixture.directory, 'runtime.log');
    const stream = fs.createWriteStream(filename, { flags: 'a', encoding: 'utf8' });
    await once(stream, 'open');
    const factory = jest.spyOn(fs, 'createWriteStream').mockReturnValue(stream);
    const healthy = new fixture.RecordingTransport();
    const emergency = jest.fn();
    const logger = fixture.create(
      { LOG_DESTINATIONS: 'file,healthy', LOG_FILE_PATH: filename },
      {
        file: fileDriver,
        healthy: fixture.driver(healthy),
      },
      emergency,
    );
    factory.mockRestore();
    logger.log('before disk error');
    await new Promise<void>((resolve) => stream.write('', () => resolve()));
    stream.emit('error', new Error('disk full'));
    stream.emit('error', new Error('disk still full'));
    logger.log('after disk error');
    await logger.close();
    expect(healthy.entries.map((entry) => entry.message)).toEqual(['before disk error', 'after disk error']);
    expect(readFileSync(filename, 'utf8')).toContain('before disk error');
    expect(readFileSync(filename, 'utf8')).not.toContain('after disk error');
    expect(emergency).toHaveBeenCalledTimes(1);
    expect(emergency).toHaveBeenCalledWith(expect.stringContaining('Destination "file" disabled: disk full'));
  });
}

export function registerIsolatesAsynchronousFileOpenErrorsEvenWhenShutdownBeginsBeforeOpeningComplCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
  it('isolates asynchronous file-open errors even when shutdown begins before opening completes', async () => {
    const healthy = new fixture.RecordingTransport();
    const emergency = jest.fn();
    const logger = fixture.create(
      { LOG_DESTINATIONS: 'file,healthy', LOG_FILE_PATH: fixture.directory },
      {
        file: fileDriver,
        healthy: fixture.driver(healthy),
      },
      emergency,
    );
    logger.log('healthy entry');
    await logger.close();
    expect(healthy.entries).toHaveLength(1);
    expect(emergency).toHaveBeenCalledTimes(1);
    expect(emergency.mock.calls[0][0]).toMatch(/Destination "file" disabled:.*EISDIR/);
  });
}

export function registerIsolatesFileInitializationFailuresAndReportsOnceWithoutDisablingHealthyDrivCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
  it('isolates file initialization failures and reports once without disabling healthy drivers', async () => {
    writeFileSync(join(fixture.directory, 'blocked'), 'not a directory');
    const healthy = new fixture.RecordingTransport();
    const emergency = jest.fn();
    const logger = fixture.create(
      { LOG_DESTINATIONS: 'file,healthy', LOG_FILE_PATH: 'blocked/api.log' },
      {
        file: fileDriver,
        healthy: fixture.driver(healthy),
      },
      emergency,
    );
    logger.log('still running');
    logger.log('still running again');
    await logger.close();
    expect(healthy.entries).toHaveLength(2);
    expect(emergency).toHaveBeenCalledTimes(1);
    expect(emergency).toHaveBeenCalledWith(expect.stringMatching(/Destination "file" disabled:.*(EEXIST|ENOTDIR)/));
  });
}

export function registerIsolatesRuntimeDestinationFailuresSSuppressesSpamAndClosesHealthyDriversCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
  it.each(['event', 'throw', 'format'])(
    'isolates runtime destination failures (%s), suppresses spam and closes healthy drivers',
    async (mode) => {
      const broken = new fixture.RecordingTransport();
      if (mode === 'throw')
        broken.log = () => {
          throw new Error('disk full');
        };
      if (mode === 'format')
        broken.format = format(() => {
          throw new Error('format failed');
        })();
      const healthy = new fixture.RecordingTransport();
      const emergency = jest.fn();
      const logger = fixture.create(
        { LOG_DESTINATIONS: 'broken,healthy' },
        { broken: fixture.driver(broken), healthy: fixture.driver(healthy) },
        emergency,
      );
      if (mode === 'event') broken.emit('error', new Error('disk full'));
      logger.log('first');
      broken.emit('error', new Error('second error'));
      logger.log('second');
      await logger.close();
      expect(healthy.entries.map((entry) => entry.message)).toEqual(['first', 'second']);
      expect(healthy.closeSpy).toHaveBeenCalledTimes(1);
      expect(emergency).toHaveBeenCalledTimes(1);
    },
  );
}
