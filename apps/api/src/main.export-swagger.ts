import { join } from 'path';
import { writeFileSync } from 'fs';
import { Logger } from '@nestjs/common';

async function main() {
  Logger.attachBuffer();
  const logger = new Logger('SwaggerExport');
  logger.log('Exporting swagger');

  logger.log('Bootstrapping');

  process.env.DISABLE_PLUGINS = 'true';
  const main = await import('./main.bootstrap');
  const { app, swaggerDocumentFactory } = await main.bootstrap();

  logger.log('Creating swagger document');
  const distDir = join(__dirname, '../../apps/api-swagger');
  const swaggerDocument = swaggerDocumentFactory();

  logger.log('Writing swagger');
  writeFileSync(join(distDir, 'swagger.json'), JSON.stringify(swaggerDocument, null, 2));

  logger.log('Done');
  await app.close();
  process.exit(0);
}

main();
