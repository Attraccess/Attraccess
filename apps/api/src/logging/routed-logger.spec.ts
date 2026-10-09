import { registerApiLogDestinationsOnInstalledNest11Fixture } from './routed-logger.api-log-destinations-on-installed-nest-11.test-fixture';
import fs, { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileDriver } from './log-destinations';
import { logDestinationsSchema, logLevelsSchema } from './logging.config';
import { once } from 'node:events';
import { format } from 'winston';
import { ConsoleLogger, Logger, Module, OnModuleInit, LogLevel } from '@nestjs/common';
import { stripVTControlCharacters } from 'node:util';
import { NestFactory } from '@nestjs/core';

describe('API log destinations on installed Nest 11', () => {
  const fixture = registerApiLogDestinationsOnInstalledNest11Fixture();

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

  it('rejects unknown names and invalid selected options before opening any transport', () => {
    const configure = jest.fn(() => jest.fn());
    expect(() =>
      fixture.create(
        { LOG_DESTINATIONS: 'console,remote' },
        {
          console: { configure },
          file: fileDriver,
        },
      ),
    ).toThrow('Unknown LOG_DESTINATIONS driver "remote". Registered drivers: console, file');
    const factory = configure.mock.results[0].value;
    expect(factory).not.toHaveBeenCalled();
    for (const path of ['', '   ', 'bad\0path']) {
      expect(() => fixture.create({ LOG_DESTINATIONS: 'file', LOG_FILE_PATH: path })).toThrow('LOG_FILE_PATH');
    }
    expect(() => fixture.create({ LOG_DESTINATIONS: ' , ' })).toThrow('at least one driver');
    expect(() => fixture.create({ LOG_LEVELS: 'info' })).toThrow('Invalid log level');
    expect(() => fixture.create({ LOG_LEVELS: 'fatal' })).toThrow('Invalid log level');
  });

  it.each(['', 'log', 'error', 'warn', 'debug', 'verbose', 'log,error', 'debug,error', ' WARN, Log '])(
    'retains Nest filtering for LOG_LEVELS=%j, including gaps and fatal calls',
    async (levels) => {
      const recording = new fixture.RecordingTransport();
      const logger = fixture.create(
        { LOG_LEVELS: levels, LOG_DESTINATIONS: 'test' },
        { test: fixture.driver(recording) },
      );
      const nest = new ConsoleLogger({ logLevels: logLevelsSchema.parse(levels) });
      const all: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];
      for (const level of all) logger[level](`entry-${level}`);
      await logger.close();
      expect(recording.entries.map((entry) => entry.level)).toEqual(all.filter((level) => nest.isLevelEnabled(level)));
    },
  );

  it('registers a third transport and preserves object/variadic messages, context and supplied errors', async () => {
    const console = new fixture.RecordingTransport();
    const third = new fixture.RecordingTransport();
    const logger = fixture.create(
      { ...fixture.env, LOG_DESTINATIONS: 'console,third' },
      { console: fixture.driver(console), third: fixture.driver(third) },
    );
    Logger.overrideLogger(logger);
    const producer = new Logger('Plugin');
    const object = { message: 'nested message', level: 'not-a-log-level', data: { count: 2 } };
    const error = new Error('object error');
    const stack = 'Error: supplied\n    at caller (/test.ts:1:2)';
    producer.log(object, 'second', 42);
    producer.error('failed', error, stack);
    producer.error(error);
    Logger.warn('static message', 'Framework');
    await logger.close();
    expect(third.entries).toEqual(console.entries);
    expect(third.entries.map((entry) => entry.message)).toEqual([
      object,
      'second',
      42,
      'failed',
      error,
      error,
      'static message',
    ]);
    expect(third.entries.slice(0, 6).every((entry) => entry.context === 'Plugin')).toBe(true);
    expect(third.entries[3]).toMatchObject({ stack, level: 'error', printStack: false });
    expect(third.entries[4]).toMatchObject({ stack, printStack: true });
    expect(third.entries[6].context).toBe('Framework');
    expect(third.entries.every((entry) => !Number.isNaN(Date.parse(entry.timestamp)))).toBe(true);
  });

  it('keeps console formatting and stdout/stderr routing compatible with Nest and fail2ban', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1780000000000);
    const { stdout, stderr } = fixture.captureOutput();
    const audit =
      'auth.failed type=login outcome=invalid_credentials ip=1.2.3.4 user_id=42 username=alice ts=2026-05-28T20:00:00Z reason=bad_password';
    const emit = (logger: ConsoleLogger) => {
      logger.log({ value: 42 }, 'Application');
      logger.warn(audit, 'AuthAudit');
      logger.error('failure', 'Error: failure\n    at caller (/test.ts:1:2)', 'Application');
      logger.fatal('fatal', 'Application');
    };
    emit(new ConsoleLogger());
    const expected = { stdout: stdout.join(''), stderr: stderr.join('') };
    stdout.length = stderr.length = 0;
    const logger = fixture.create(fixture.env);
    emit(logger);
    await logger.close();
    expect({ stdout: stdout.join(''), stderr: stderr.join('') }).toEqual(expected);
    expect(stripVTControlCharacters(stdout.join(''))).toContain(`[AuthAudit] ${audit}\n`);
    expect(stderr.join('')).not.toContain(audit);
  });

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

  it.each([false, true])(
    'resolves paths, creates directories, flushes UTF-8 and appends on restart (absolute=%s)',
    async (absolute) => {
      const relative = 'nested/log/api.log';
      const filename = join(fixture.directory, relative);
      const options = { ...fixture.env, LOG_DESTINATIONS: 'file', LOG_FILE_PATH: absolute ? filename : relative };
      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger = fixture.create(options);
      for (let index = 0; index < 500; index++) logger.log(`\u001b[31mGrüße ${index}\u001b[0m`, 'File');
      logger.error('failed', 'Error: supplied\n    at caller (/test.ts:1:2)', 'File');
      await logger.close();
      const first = readFileSync(filename, 'utf8');
      expect(first.match(/Grüße/g)).toHaveLength(500);
      expect(stripVTControlCharacters(first)).toBe(first);
      expect(first).toContain('[File] Grüße 499');
      expect(first.match(/Error: supplied/g)).toHaveLength(1);
      const restarted = fixture.create(options);
      restarted.log('after restart');
      await restarted.close();
      expect(readFileSync(filename, 'utf8').startsWith(first)).toBe(true);
      expect(readFileSync(filename, 'utf8')).toContain('after restart');
      expect(stdout).not.toHaveBeenCalled();
    },
  );

  it('fans out once to console and file', async () => {
    const { stdout } = fixture.captureOutput();
    const logger = fixture.create({ LOG_DESTINATIONS: 'console,file,file', LOG_FILE_PATH: 'api.log' });
    logger.log('unique-message', 'Fanout');
    await logger.close();
    expect(stdout.join('').match(/unique-message/g)).toHaveLength(1);
    expect(readFileSync(join(fixture.directory, 'api.log'), 'utf8').match(/unique-message/g)).toHaveLength(1);
  });

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

  it('does not buffer indefinitely or throw when all destinations fail', async () => {
    const broken = new fixture.RecordingTransport();
    const logger = fixture.create({ LOG_DESTINATIONS: 'broken' }, { broken: fixture.driver(broken) });
    broken.emit('error', new Error('unavailable'));
    for (let i = 0; i < 100; i++) logger.error('no destination');
    await logger.close();
    expect(broken.entries).toEqual([]);
  });

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

  it('replays buffered bootstrap/framework logs once and keeps transports open across temporary contexts', async () => {
    class Startup implements OnModuleInit {
      onModuleInit() {
        new Logger('Provider').log('provider-started');
      }
    }
    @Module({ providers: [Startup] })
    class TestModule {}
    const recording = new fixture.RecordingTransport();
    const logger = fixture.create({ LOG_DESTINATIONS: 'third' }, { third: fixture.driver(recording) });
    Logger.attachBuffer();
    new Logger('Bootstrap').log('before-env');
    const context = await NestFactory.createApplicationContext(TestModule, {
      bufferLogs: true,
      autoFlushLogs: false,
      abortOnError: false,
    });
    context.useLogger(logger);
    Logger.flush();
    Logger.flush();
    await context.close();
    expect(recording.closeSpy).not.toHaveBeenCalled();
    const finalContext = await NestFactory.createApplicationContext(TestModule, { logger, abortOnError: false });
    new Logger('Application').log('after-config');
    await finalContext.close();
    expect(recording.closeSpy).not.toHaveBeenCalled();
    await logger.close();
    expect(recording.entries.filter((entry) => entry.message === 'before-env')).toHaveLength(1);
    expect(recording.entries.filter((entry) => entry.message === 'provider-started')).toHaveLength(2);
    expect(recording.entries.filter((entry) => entry.context === 'NestFactory')).toHaveLength(2);
    expect(recording.entries.filter((entry) => entry.message === 'after-config')).toHaveLength(1);
    expect(recording.closeSpy).toHaveBeenCalledTimes(1);
  });
});
