import { bootstrap, startListening } from './main.bootstrap';
import { PluginService } from './plugin-system/plugin.service';

import { Logger } from '@nestjs/common';
import { flushBootstrapLogs, shutdownProcessLogging } from './logging/process-logging';

async function main() {
  const logger = new Logger('Bootstrap');
  try {
    const { app, port, globalPrefix, nodeEnv, shouldGuardPluginLifecycle } = await bootstrap();
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
    // Plugin lifecycle hooks run during initialization, before socket binding.
    await app.init();
    if (shouldGuardPluginLifecycle) PluginService.clearBootGuard();
    await startListening(app, port, globalPrefix, nodeEnv);
  } catch (error) {
    flushBootstrapLogs();
    logger.error('Failed to bootstrap application', error.stack);
    PluginService.recordBootFailure(error);
    await shutdownProcessLogging();
    process.exit(1);
  }
}

main();
