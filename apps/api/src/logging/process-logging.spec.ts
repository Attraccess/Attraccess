import { ConsoleLogger, Global, Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  flushBootstrapLogs,
  initializeProcessLogging,
  shutdownProcessLogging,
  withLoggingLifecycle,
} from './process-logging';

@Global()
@Module({
  providers: [
    {
      provide: 'GLOBAL_SHUTDOWN_LOG',
      useValue: {
        onApplicationShutdown: () => new Logger('GlobalService').log('global-shutdown-entry'),
      },
    },
  ],
})
class GlobalTestModule {}

@Module({
  imports: [GlobalTestModule],
  providers: [
    {
      provide: 'SHUTDOWN_LOG',
      useValue: {
        onApplicationShutdown: () => new Logger('Service').log('shutdown-entry'),
      },
    },
  ],
})
class TestModule {}

describe('process logging ownership', () => {
  afterEach(() => {
    Logger.detachBuffer();
    Logger.overrideLogger(new ConsoleLogger());
    jest.restoreAllMocks();
  });

  it('retains emergency console diagnostics if configuration fails before routing exists', () => {
    const output: string[] = [];
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    Logger.attachBuffer();
    new Logger('Bootstrap').error('configuration failed');
    flushBootstrapLogs();
    new Logger('Bootstrap').error('failure after flush');
    expect(output.join('')).toContain('configuration failed');
    expect(output.join('')).toContain('failure after flush');
  });

  it('initializes once, survives temporary context close and flushes through the final Nest shutdown hook', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'attraccess-process-logging-'));
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      LOG_DESTINATIONS: 'file',
      LOG_FILE_PATH: join(directory, 'api.log'),
      LOG_LEVELS: 'warn,log',
    };
    try {
      const logger = initializeProcessLogging();
      const close = jest.spyOn(logger, 'close');
      expect(initializeProcessLogging()).toBe(logger);
      expect(Logger.isLevelEnabled('error')).toBe(true);
      expect(Logger.isLevelEnabled('debug')).toBe(false);
      const temporary = await NestFactory.createApplicationContext(TestModule, { logger });
      await temporary.close();
      expect(close).not.toHaveBeenCalled();
      const application = await NestFactory.createApplicationContext(withLoggingLifecycle(TestModule), { logger });
      for (let i = 0; i < 100; i++) new Logger('Service').log(`pending ${i}`);
      await application.close();
      expect(close).toHaveBeenCalledTimes(1);
      expect(readFileSync(join(directory, 'api.log'), 'utf8').match(/pending \d+/g)).toHaveLength(100);
      expect(readFileSync(join(directory, 'api.log'), 'utf8').match(/\[Service\] shutdown-entry/g)).toHaveLength(2);
      expect(
        readFileSync(join(directory, 'api.log'), 'utf8').match(/\[GlobalService\] global-shutdown-entry/g),
      ).toHaveLength(2);
      await shutdownProcessLogging();
    } finally {
      process.env = originalEnv;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
