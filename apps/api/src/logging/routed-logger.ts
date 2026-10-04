import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { Logger as WinstonLogger } from 'winston';
import Transport from 'winston-transport';
import { defaultLogDrivers, LogDestinationDriver, RoutedLogEntry } from './log-destinations';
import { logDestinationsSchema, logLevelsSchema } from './logging.config';

// Winston must not apply a second, different threshold after Nest has filtered.
const nestLevels = { fatal: 0, error: 1, warn: 2, log: 3, debug: 4, verbose: 5 };

export class RoutedLogger extends ConsoleLogger {
  private readonly winston: WinstonLogger;
  private readonly active = new Map<Transport, string>();
  private readonly failed = new Set<string>();
  private readonly errorForwarders = new Map<Transport, ((...args: unknown[]) => void)[]>();
  private closing?: Promise<void>;
  private stopping = false;

  constructor(
    env: NodeJS.ProcessEnv = process.env,
    drivers: Readonly<Record<string, LogDestinationDriver>> = defaultLogDrivers,
    cwd = process.cwd(),
    private readonly emergency: (message: string) => void = (message) => {
      process.stderr.write(message);
    },
  ) {
    super({ logLevels: logLevelsSchema.parse(env.LOG_LEVELS) });
    const names = logDestinationsSchema.parse(env.LOG_DESTINATIONS);
    // Validate everything before opening any transports. Only operational IO
    // failures are isolated; configuration mistakes must abort startup.
    const factories = names.map((name) => {
      const driver = Object.prototype.hasOwnProperty.call(drivers, name) ? drivers[name] : undefined;
      if (!driver)
        throw new Error(
          `Unknown LOG_DESTINATIONS driver "${name}". Registered drivers: ${Object.keys(drivers).join(', ')}.`,
        );
      return { name, create: driver.configure(env, cwd) };
    });
    // Use the public core logger: createLogger synthesizes convenience methods
    // and warns about Nest's "log" level colliding with Winston's log method.
    this.winston = new WinstonLogger({ levels: nestLevels, level: 'verbose' });
    this.winston.on('error', (error: Error, transport?: Transport) => {
      if (transport) this.disable(transport, error);
      else this.report('routing', error);
    });
    for (const { name, create } of factories) {
      try {
        const transport = create();
        transport.level = 'verbose';
        this.active.set(transport, name);
        // Third-party transports may throw instead of emitting an error. Keep
        // that exception inside the destination, allowing Winston to fan out.
        const log = transport.log?.bind(transport);
        if (log)
          transport.log = (info, callback) => {
            try {
              log(info, callback);
            } catch (error) {
              this.disable(transport, error);
              callback();
            }
          };
        const logv = transport.logv?.bind(transport);
        if (logv)
          transport.logv = (infos, callback) => {
            try {
              logv(infos, callback);
            } catch (error) {
              this.disable(transport, error);
              callback();
            }
          };
        if (transport.format) {
          const transform = transport.format.transform.bind(transport.format);
          transport.format.transform = (info, options) => {
            try {
              return transform(info, options);
            } catch (error) {
              this.disable(transport, error);
              return false;
            }
          };
        }
        const close = transport.close?.bind(transport);
        if (close)
          transport.close = () => {
            try {
              close();
            } catch (error) {
              this.report(name, error);
            }
          };
        // Writable.finish must still complete if a driver fails while flushing.
        // In particular, File can be waiting for an open event that never comes.
        const final = transport._final?.bind(transport);
        if (final)
          transport._final = (callback) => {
            let finished = false;
            const done = (error?: Error | null) => {
              if (finished) return;
              finished = true;
              transport.removeListener('error', onError);
              transport.removeListener('close', onClose);
              if (error) this.disable(transport, error);
              callback();
            };
            const onError = (error: Error) => done(error);
            const onClose = () => done();
            transport.once('error', onError);
            transport.once('close', onClose);
            try {
              final(done);
            } catch (error) {
              done(error instanceof Error ? error : new Error(String(error)));
            }
          };
        const before = transport.listeners('error');
        this.winston.add(transport);
        this.errorForwarders.set(
          transport,
          transport.listeners('error').filter((listener) => !before.includes(listener)),
        );
        transport.on('error', (error: Error) => this.disable(transport, error));
      } catch (error) {
        this.report(name, error);
      }
    }
  }

  protected override printMessages(
    messages: unknown[],
    context = '',
    level: LogLevel = 'log',
    _stream?: 'stdout' | 'stderr',
    stack?: string,
  ): void {
    // Avoid Winston buffering forever if every selected destination has failed.
    if (this.active.size === 0 || this.stopping) return;
    const timestamp = new Date().toISOString();
    const displayTimestamp = this.getTimestamp();
    messages.forEach((message, index) => {
      const entry: RoutedLogEntry = {
        level,
        message,
        context,
        timestamp,
        displayTimestamp,
        stack,
        printStack: index === messages.length - 1,
      };
      // Winston's object-mode stream retains non-string Nest messages intact.
      this.winston.write(entry);
    });
  }

  protected override printStackTrace(): void {
    // Supplied stacks travel with their entries; drivers print them once.
  }

  private report(name: string, error: unknown): void {
    if (this.failed.has(name)) return;
    this.failed.add(name);
    this.emergency(
      `[Logging] Destination "${name}" disabled: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }

  private disable(transport: Transport, error: unknown): void {
    const name = this.active.get(transport);
    if (!name) return;
    this.active.delete(transport);
    this.report(name, error);
    // Winston's error forwarder otherwise re-adds removed transports on later
    // errors. Keep our emergency listener attached to absorb subsequent errors.
    for (const listener of this.errorForwarders.get(transport) ?? []) transport.removeListener('error', listener);
    this.errorForwarders.delete(transport);
    transport.silent = true;
    this.winston.remove(transport);
    // During end(), destroying before _final's callback prevents Writable's
    // finish event and leaves Winston waiting forever. The guarded finalizer
    // completes it instead; unpipe has already closed the driver's resources.
    if (!this.stopping) transport.destroy();
  }

  close(): Promise<void> {
    if (!this.closing) {
      this.stopping = true;
      this.closing = new Promise<void>((resolve) => {
        this.winston.once('finish', () => {
          this.winston.close();
          resolve();
        });
        this.winston.end();
      });
    }
    return this.closing;
  }
}
