import { bootstrap, startListening } from './main.bootstrap';
import { PluginService } from './plugin-system/plugin.service';

import { Logger } from '@nestjs/common';

async function main() {
  const logger = new Logger('Bootstrap');
  try {
    const { app, port, globalPrefix, nodeEnv, shouldGuardPluginLifecycle } = await bootstrap();
    await startListening(app, port, globalPrefix, nodeEnv);
    if (shouldGuardPluginLifecycle) PluginService.clearBootGuard();
  } catch (error) {
    logger.error('Failed to bootstrap application', error.stack);
    PluginService.recordBootFailure(error);
    process.exit(1);
  }
}

main();
