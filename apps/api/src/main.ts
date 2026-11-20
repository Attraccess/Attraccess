import { Logger } from '@nestjs/common';
import { flushBootstrapLogs, shutdownProcessLogging } from './logging/process-logging';

async function main() {
  // Attach before importing bootstrap dependencies: database/module diagnostics
  // can run at import time, before the .env-backed logger is available.
  Logger.attachBuffer();
  const logger = new Logger('Bootstrap');
  let pluginService: typeof import('./plugin-system/plugin.service').PluginService | undefined;
  try {
    const { PluginService } = await import('./plugin-system/plugin.service');
    pluginService = PluginService;
    const { bootstrap, startListening } = await import('./main.bootstrap');
    const { app, port, globalPrefix, nodeEnv, shouldGuardPluginLifecycle } = await bootstrap();
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
    // Plugin lifecycle hooks run during initialization, before socket binding.
    await app.init();
    if (shouldGuardPluginLifecycle) PluginService.clearBootGuard();
    await startListening(app, port, globalPrefix, nodeEnv);
  } catch (error) {
    flushBootstrapLogs();
    logger.error('Failed to bootstrap application', error.stack);
    pluginService?.recordBootFailure(error);
    await shutdownProcessLogging();
    process.exit(1);
  }
}

if (process.argv[2] === 'transfer-sqlite') {
  // `node main.js transfer-sqlite [--sqlite <path>] [--force]`: the manual SQLite -> PostgreSQL transfer.
  import('./database/transfer/transfer-cli')
    .then(({ runTransferCommand }) => runTransferCommand(process.argv.slice(3)))
    .then((code) => process.exit(code));
} else {
  main();
}
