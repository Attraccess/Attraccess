import { ConsoleLogger, Logger, Module, OnModuleInit, LogLevel } from '@nestjs/common';
import { stripVTControlCharacters } from 'node:util';
import { registerApiLogDestinationsOnInstalledNest11Fixture } from './routed-logger.api-log-destinations-on-installed-nest-11.test-fixture';
import { fileDriver } from './log-destinations';
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logLevelsSchema } from './logging.config';

export function registerKeepsConsoleFormattingAndStdoutStderrRoutingCompatibleWithNestAndFail2banCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
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
}

export function registerRegistersAThirdTransportAndPreservesObjectVariadicMessagesContextAndSuppliCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
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
}

export function registerRejectsUnknownNamesAndInvalidSelectedOptionsBeforeOpeningAnyTransportCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
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
}

export function registerReplaysBufferedBootstrapFrameworkLogsOnceAndKeepsTransportsOpenAcrossTempoCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
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
}

export function registerResolvesPathsCreatesDirectoriesFlushesUtf8AndAppendsOnRestartAbsoluteSCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
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
}

export function registerRetainsNestFilteringForLogLevelsJIncludingGapsAndFatalCallsCases(
  fixture: ReturnType<typeof registerApiLogDestinationsOnInstalledNest11Fixture>,
) {
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
}
