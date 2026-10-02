import { ConsoleLogger, Logger, LogLevel, Module, OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Console as NodeConsole } from 'node:console';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import fs from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { format } from 'winston';
import Transport from 'winston-transport';
import { defaultLogDrivers, fileDriver, LogDestinationDriver, RoutedLogEntry } from './log-destinations';
import { RoutedLogger } from './routed-logger';
import { logDestinationsSchema, logLevelsSchema } from './logging.config';

class RecordingTransport extends Transport {
  readonly entries: RoutedLogEntry[] = [];
  readonly closeSpy = jest.fn();
  override log(info: RoutedLogEntry, callback: () => void): void {
    this.entries.push(info);
    callback();
  }
  override close(): void {
    this.closeSpy();
  }
}

describe('API log destinations on installed Nest 11', () => {
  let directory: string;
  const loggers: RoutedLogger[] = [];
  const env = { LOG_LEVELS: 'verbose,debug,log,warn,error' };
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'attraccess-logging-'));
  });
  afterEach(async () => {
    Logger.detachBuffer();
    Logger.overrideLogger(new ConsoleLogger());
    Logger.flush();
    await Promise.all(loggers.splice(0).map((logger) => logger.close()));
    jest.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });
  function create(environment: NodeJS.ProcessEnv, drivers = defaultLogDrivers, emergency = jest.fn()) {
    const logger = new RoutedLogger(environment, drivers, directory, emergency);
    loggers.push(logger);
    return logger;
  }
  function driver(transport: Transport): LogDestinationDriver {
    return { configure: () => () => transport };
  }
  function captureOutput() {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const capture = (output: string[]) => (chunk: unknown, encodingOrCallback?: unknown, callback?: unknown) => {
      output.push(String(chunk));
      const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
      if (typeof done === 'function') done();
      return true;
    };
    jest.spyOn(process.stdout, 'write').mockImplementation(capture(stdout));
    jest.spyOn(process.stderr, 'write').mockImplementation(capture(stderr));
    // Use Node's real console contract; Jest's buffered console merges streams.
    jest.replaceProperty(global, 'console', new NodeConsole(process.stdout, process.stderr));
    return { stdout, stderr };
  }

  it('defaults to console, normalizes/deduplicates destinations and ignores unselected file options', async () => {
    expect(logDestinationsSchema.parse(undefined)).toEqual(['console']);
    const console = new RecordingTransport();
    const configure = jest.fn(() => () => console);
    const logger = create(
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
      create(
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
      expect(() => create({ LOG_DESTINATIONS: 'file', LOG_FILE_PATH: path })).toThrow('LOG_FILE_PATH');
    }
    expect(() => create({ LOG_DESTINATIONS: ' , ' })).toThrow('at least one driver');
    expect(() => create({ LOG_LEVELS: 'info' })).toThrow('Invalid log level');
    expect(() => create({ LOG_LEVELS: 'fatal' })).toThrow('Invalid log level');
  });

  it.each(['', 'log', 'error', 'warn', 'debug', 'verbose', 'log,error', 'debug,error', ' WARN, Log '])(
    'retains Nest filtering for LOG_LEVELS=%j, including gaps and fatal calls',
    async (levels) => {
      const recording = new RecordingTransport();
      const logger = create({ LOG_LEVELS: levels, LOG_DESTINATIONS: 'test' }, { test: driver(recording) });
      const nest = new ConsoleLogger({ logLevels: logLevelsSchema.parse(levels) });
      const all: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];
      for (const level of all) logger[level](`entry-${level}`);
      await logger.close();
      expect(recording.entries.map((entry) => entry.level)).toEqual(all.filter((level) => nest.isLevelEnabled(level)));
    },
  );

  it('registers a third transport and preserves object/variadic messages, context and supplied errors', async () => {
    const console = new RecordingTransport();
    const third = new RecordingTransport();
    const logger = create(
      { ...env, LOG_DESTINATIONS: 'console,third' },
      { console: driver(console), third: driver(third) },
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
    const { stdout, stderr } = captureOutput();
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
    const logger = create(env);
    emit(logger);
    await logger.close();
    expect({ stdout: stdout.join(''), stderr: stderr.join('') }).toEqual(expected);
    expect(stripVTControlCharacters(stdout.join(''))).toContain(`[AuthAudit] ${audit}\n`);
    expect(stderr.join('')).not.toContain(audit);
  });

  it.each(['default', 'relative', 'absolute'])('defaults file output to the storage root (%s)', async (kind) => {
    const storageRoot =
      kind === 'default' ? undefined : kind === 'relative' ? 'custom-storage' : join(directory, 'custom-storage');
    const logger = create({ LOG_DESTINATIONS: 'file', STORAGE_ROOT: storageRoot });
    logger.log('storage-default-entry');
    await logger.close();
    expect(readFileSync(resolve(directory, storageRoot ?? 'storage', 'api.log'), 'utf8')).toContain(
      'storage-default-entry',
    );
  });

  it.each([false, true])(
    'resolves paths, creates directories, flushes UTF-8 and appends on restart (absolute=%s)',
    async (absolute) => {
      const relative = 'nested/log/api.log';
      const filename = join(directory, relative);
      const options = { ...env, LOG_DESTINATIONS: 'file', LOG_FILE_PATH: absolute ? filename : relative };
      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger = create(options);
      for (let index = 0; index < 500; index++) logger.log(`\u001b[31mGrüße ${index}\u001b[0m`, 'File');
      logger.error('failed', 'Error: supplied\n    at caller (/test.ts:1:2)', 'File');
      await logger.close();
      const first = readFileSync(filename, 'utf8');
      expect(first.match(/Grüße/g)).toHaveLength(500);
      expect(stripVTControlCharacters(first)).toBe(first);
      expect(first).toContain('[File] Grüße 499');
      expect(first.match(/Error: supplied/g)).toHaveLength(1);
      const restarted = create(options);
      restarted.log('after restart');
      await restarted.close();
      expect(readFileSync(filename, 'utf8').startsWith(first)).toBe(true);
      expect(readFileSync(filename, 'utf8')).toContain('after restart');
      expect(stdout).not.toHaveBeenCalled();
    },
  );

  it('fans out once to console and file', async () => {
    const { stdout } = captureOutput();
    const logger = create({ LOG_DESTINATIONS: 'console,file,file', LOG_FILE_PATH: 'api.log' });
    logger.log('unique-message', 'Fanout');
    await logger.close();
    expect(stdout.join('').match(/unique-message/g)).toHaveLength(1);
    expect(readFileSync(join(directory, 'api.log'), 'utf8').match(/unique-message/g)).toHaveLength(1);
  });

  it('isolates file initialization failures and reports once without disabling healthy drivers', async () => {
    writeFileSync(join(directory, 'blocked'), 'not a directory');
    const healthy = new RecordingTransport();
    const emergency = jest.fn();
    const logger = create(
      { LOG_DESTINATIONS: 'file,healthy', LOG_FILE_PATH: 'blocked/api.log' },
      {
        file: fileDriver,
        healthy: driver(healthy),
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
    const healthy = new RecordingTransport();
    const emergency = jest.fn();
    const logger = create(
      { LOG_DESTINATIONS: 'file,healthy', LOG_FILE_PATH: directory },
      {
        file: fileDriver,
        healthy: driver(healthy),
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
      const broken = new RecordingTransport();
      if (mode === 'throw')
        broken.log = () => {
          throw new Error('disk full');
        };
      if (mode === 'format')
        broken.format = format(() => {
          throw new Error('format failed');
        })();
      const healthy = new RecordingTransport();
      const emergency = jest.fn();
      const logger = create(
        { LOG_DESTINATIONS: 'broken,healthy' },
        { broken: driver(broken), healthy: driver(healthy) },
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
    const broken = new RecordingTransport();
    const logger = create({ LOG_DESTINATIONS: 'broken' }, { broken: driver(broken) });
    broken.emit('error', new Error('unavailable'));
    for (let i = 0; i < 100; i++) logger.error('no destination');
    await logger.close();
    expect(broken.entries).toEqual([]);
  });

  it.each(['throw', 'event'])('completes shutdown when a driver finalizer fails synchronously (%s)', async (mode) => {
    const broken = new RecordingTransport();
    broken._final = () => {
      if (mode === 'throw') throw new Error('flush failed');
      broken.emit('error', new Error('flush failed'));
    };
    const healthy = new RecordingTransport();
    const emergency = jest.fn();
    const logger = create(
      { LOG_DESTINATIONS: 'broken,healthy' },
      { broken: driver(broken), healthy: driver(healthy) },
      emergency,
    );
    logger.log('pending');
    await logger.close();
    expect(healthy.entries).toHaveLength(1);
    expect(healthy.closeSpy).toHaveBeenCalledTimes(1);
    expect(emergency).toHaveBeenCalledTimes(1);
  });

  it('forwards a file write-stream runtime error and continues healthy delivery without repeated diagnostics', async () => {
    const filename = join(directory, 'runtime.log');
    const stream = fs.createWriteStream(filename, { flags: 'a', encoding: 'utf8' });
    await once(stream, 'open');
    const factory = jest.spyOn(fs, 'createWriteStream').mockReturnValue(stream);
    const healthy = new RecordingTransport();
    const emergency = jest.fn();
    const logger = create(
      { LOG_DESTINATIONS: 'file,healthy', LOG_FILE_PATH: filename },
      {
        file: fileDriver,
        healthy: driver(healthy),
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
    const recording = new RecordingTransport();
    const logger = create({ LOG_DESTINATIONS: 'third' }, { third: driver(recording) });
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
