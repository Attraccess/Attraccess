import { ConfigError, loadConfig } from './config';
import { createLogger } from './logger';
import { createSidecar } from './sidecar';

// A supervisor that closes our stdout must not crash the sidecar with EPIPE; the log lines are simply lost.
process.stdout.on('error', () => undefined);
const logger = createLogger();

// Operational failures (ConfigError, listen errors like EADDRINUSE) are fully described by the message itself.
const isOperational = (error: unknown) => error instanceof ConfigError || (error instanceof Error && 'code' in error);

function fatal(message: string, error?: unknown): never {
  process.stderr.write(`matter-sidecar: ${message}\n`);
  if (error instanceof Error && !isOperational(error)) process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const sidecar = createSidecar({ config, logger });
  let signalled = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (signalled) return logger('info', 'already shutting down', { signal });
    signalled = true;
    logger('info', 'shutting down', { signal });
    // Bounded exit even if something refuses to close.
    setTimeout(() => process.exit(1), config.shutdownGraceMs + 1_000).unref();
    sidecar.stop().then(
      () => process.exit(0),
      (error) => fatal('shutdown failed', error),
    );
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
  await sidecar.start();
}

function startupFailure(error: unknown): string {
  if (error instanceof ConfigError) {
    return `${error.message}. Fix the MATTER_SIDECAR_* environment variables and start again.`;
  }
  const hint =
    error instanceof Error && 'code' in error && error.code === 'EADDRINUSE'
      ? ' Set MATTER_SIDECAR_PORT to a free port.'
      : '';
  const reason = error instanceof Error ? error.message : 'unknown error';
  return `could not start (${reason}).${hint} Only the sidecar stopped; Attraccess is unaffected.`;
}

main().catch((error) => fatal(startupFailure(error), error));
