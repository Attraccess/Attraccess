# API log destinations

Services and plugins keep using `Logger` from `@nestjs/common`. `RoutedLogger` extends Nest's `ConsoleLogger` to reuse the installed Nest 11.1.28 argument parsing and effective level filter, then passes intact messages, context, level, ISO timestamp and supplied stacks to Winston's object-mode logger. There is no separate producer API. See [operator configuration](installation/environment-variables.md#api-application-logs).

`nest-winston` was evaluated: its fixed argument positions lose variadic parameters, and its object handling extracts `message`/`level` instead of preserving Nest's arbitrary object messages. The small local adapter therefore reuses Nest directly. Winston handles transport fan-out and buffering. The console driver uses Winston Console and Nest formatting. The file driver uses Winston Stream with an append-only UTF-8 file stream; it forwards stream errors and waits for file writes on shutdown. Winston File's filename mode currently swallows underlying write-stream errors, so it cannot provide the required failure isolation by itself.

## Register a driver

Implement `LogDestinationDriver` in `apps/api/src/logging/log-destinations.ts` (or a separate driver file) and add a name to `defaultLogDrivers`. `configure(env, cwd)` validates only that driver's options and returns a factory creating a standard `winston-transport` instance. It runs only when the driver is selected. Validation must throw actionable configuration errors before opening resources; the returned factory owns IO and formatting.

```ts
import Transport from 'winston-transport';
import { LogDestinationDriver, RoutedLogEntry } from './log-destinations';

// Example third driver; a production driver can return any compatible transport.
const exampleDriver: LogDestinationDriver = {
  configure(env) {
    const endpoint = env.LOG_EXAMPLE_ENDPOINT?.trim();
    if (!endpoint) throw new Error('LOG_EXAMPLE_ENDPOINT is required for example.');
    return () => new Transport({
      log(info: RoutedLogEntry, callback) {
        // Deliver info to endpoint. Acknowledge after delivery/buffering;
        // emit transport "error" for failures. Keep raw object messages intact.
        callback();
      },
      close() { /* release destination resources */ },
    });
  },
};

// In the registry: example: exampleDriver
// Environment: LOG_DESTINATIONS=console,example
```

Each entry contains `message`, Nest `level` (`log`, `warn`, `error`, `debug`, `verbose`, `fatal`), `context`, `timestamp` (ISO), `displayTimestamp` (Nest console timestamp), optional `stack`, and `printStack`. Variadic messages produce separate entries, just as Nest prints separate lines; `printStack` identifies the final entry so a readable driver prints a supplied stack once. An Error message retains the Error object and its details. Do not reinterpret an object's `message` or `level` as routing metadata. Drivers own destination formatting. The router applies Nest filtering before Winston, and configures transports to admit all remaining Nest levels; do not add another Winston threshold.

Use the Writable `_final(callback)` hook to finish queued writes before acknowledging shutdown, and `close()` to release resources. Emit `error` on operational failures. The router disables a failed transport, emits one emergency stderr diagnostic per destination, and guards synchronous transport/format/lifecycle exceptions. Transports should neither replace Nest's global logger nor close shared transports from service/plugin lifecycle hooks.

## Startup and ownership

The bootstrap attaches Nest's log buffer before its first entry. After the minimal config context loads `.env`, process logging initializes once and Nest flushes the buffer once. All later contexts share it. Plugin configuration/migrations still precede the AppModule import. Only the final application includes `withLoggingLifecycle`, whose shutdown hook awaits transport completion; closing temporary contexts never owns shared drivers. The main startup error handler flushes to the emergency console if routing does not yet exist, or drains the configured logger before exiting.

`routed-logger.spec.ts` proves third-driver registration without producer/router changes, and checks parsing, filtering, fail2ban formatting, append/path handling, failure isolation and flush behavior against the installed Nest package. `process-logging.spec.ts` exercises actual Nest context shutdown ownership.
