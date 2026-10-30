import { loadConfig } from './config';
import { createLogger } from './logger';
import { createSidecar } from './sidecar';
import { isOperational, startupFailure } from './startup-failure';

// A supervisor that closes our stdout must not crash the sidecar with EPIPE; the log lines are simply lost.
process.stdout.on('error', () => undefined);
const logger = createLogger();

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

main().catch((error) => fatal(startupFailure(error), error));
