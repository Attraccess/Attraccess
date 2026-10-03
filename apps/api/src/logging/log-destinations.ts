import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { format, transports } from 'winston';
import Transport from 'winston-transport';

export interface RoutedLogEntry {
  level: LogLevel;
  message: unknown;
  context: string;
  timestamp: string;
  displayTimestamp: string;
  stack?: string;
  printStack: boolean;
}

/** Validate selected-driver options first; the returned factory performs IO later. */
export interface LogDestinationDriver {
  configure(env: NodeJS.ProcessEnv, cwd: string): () => Transport;
}

// Reuse Nest's formatting as well as its argument parser. Each destination owns
// its formatter, so colors and other destination options cannot leak between them.
class NestLogFormatter extends ConsoleLogger {
  private displayTimestamp: string;

  override getTimestamp(): string {
    return this.displayTimestamp ?? super.getTimestamp();
  }

  render(entry: RoutedLogEntry): string {
    this.displayTimestamp = entry.displayTimestamp;
    const line = this.formatMessage(
      entry.level,
      entry.message,
      this.formatPid(process.pid),
      entry.level.toUpperCase().padStart(7, ' '),
      this.formatContext(entry.context),
      '',
    );
    return line.slice(0, -1) + (entry.printStack && entry.stack ? `\n${entry.stack}` : '');
  }
}

function nestFormat(colors?: boolean) {
  const formatter = new NestLogFormatter(colors === undefined ? {} : { colors });
  return format.printf((info) => {
    const rendered = formatter.render(info as unknown as RoutedLogEntry);
    return colors === false ? stripVTControlCharacters(rendered) : rendered;
  });
}

export const consoleDriver: LogDestinationDriver = {
  configure: () => () => {
    const transport = new transports.Console({
      format: nestFormat(),
      // Nest sends only error (including its supplied stack) to stderr.
      stderrLevels: ['error'],
      eol: '\n',
    });
    // Winston Console acknowledges writes immediately. Empty writes form a
    // barrier after all earlier output without closing the process streams.
    transport._final = (callback) => {
      let pending = 2;
      const done = (error?: Error | null) => {
        if (error) transport.emit('error', error);
        if (--pending === 0) callback();
      };
      process.stdout.write('', done);
      process.stderr.write('', done);
    };
    return transport;
  },
};

export const fileDriver: LogDestinationDriver = {
  configure(env, cwd) {
    const path = env.LOG_FILE_PATH?.trim() ?? join(env.STORAGE_ROOT ?? 'storage', 'api.log');
    if (!path || path.includes('\0')) {
      throw new Error('LOG_FILE_PATH must be a non-blank path without null bytes when LOG_DESTINATIONS includes file.');
    }
    const filename = resolve(cwd, path);
    return () => {
      mkdirSync(dirname(filename), { recursive: true });
      // Winston File currently swallows write-stream errors in filename mode.
      // Its standard Stream transport lets this driver own error forwarding and
      // wait for the actual file stream to flush, without implementing delivery.
      const stream = createWriteStream(filename, { flags: 'a', encoding: 'utf8' });
      const transport = new transports.Stream({ stream, format: nestFormat(false), eol: '\n' });
      stream.on('error', (error) => transport.emit('error', error));
      transport._final = (callback) => {
        if (stream.closed) callback();
        else {
          // Wait for both pending writes and the underlying descriptor to close.
          stream.once('close', () => callback());
          if (!stream.destroyed) stream.end();
        }
      };
      transport.close = () => {
        stream.destroy();
      };
      return transport;
    };
  },
};

export const defaultLogDrivers: Readonly<Record<string, LogDestinationDriver>> = {
  console: consoleDriver,
  file: fileDriver,
};
