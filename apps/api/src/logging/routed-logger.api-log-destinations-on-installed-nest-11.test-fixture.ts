import { ConsoleLogger, Logger } from '@nestjs/common';
import { Console as NodeConsole } from 'node:console';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Transport from 'winston-transport';
import { defaultLogDrivers, LogDestinationDriver, RoutedLogEntry } from './log-destinations';
import { RoutedLogger } from './routed-logger';

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
export function registerApiLogDestinationsOnInstalledNest11Fixture() {
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
  return {
    get RecordingTransport() {
      return RecordingTransport;
    },
    get directory() {
      return directory;
    },
    get env() {
      return env;
    },
    get create() {
      return create;
    },
    get driver() {
      return driver;
    },
    get captureOutput() {
      return captureOutput;
    },
  };
}
