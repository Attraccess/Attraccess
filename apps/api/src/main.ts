import { bootstrap, startListening } from './main.bootstrap';

import { Logger } from '@nestjs/common';

async function main() {
  const logger = new Logger('Bootstrap');
  try {
    const { app, port, globalPrefix, nodeEnv } = await bootstrap();
    await startListening(app, port, globalPrefix, nodeEnv);
  } catch (error) {
    logger.error('Failed to bootstrap application', error.stack);
    process.exit(1);
  }
}

main();
