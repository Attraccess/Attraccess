import { bootstrap, startListening } from './main.bootstrap';
import { Logger } from '@nestjs/common';
import { ToolRegistry } from './ai/tools/tool-registry';

async function main() {
  const logger = new Logger('Bootstrap');
  try {
    const { app, port, globalPrefix, nodeEnv, swaggerDocumentFactory } = await bootstrap();

    try {
      const toolRegistry = app.get(ToolRegistry);
      toolRegistry.setOpenApiDocument(swaggerDocumentFactory());
    } catch {
      logger.warn('ToolRegistry not available, skipping OpenAPI doc injection');
    }

    await startListening(app, port, globalPrefix, nodeEnv);
  } catch (error) {
    logger.error('Failed to bootstrap application', error.stack);
    process.exit(1);
  }
}

main();
