import { join } from 'path';
import { writeFileSync } from 'fs';
import { Logger } from '@nestjs/common';

/* eslint-disable no-console */

async function main() {
  console.log('Exporting swagger');

  console.log('Bootstrapping');

  process.env.DISABLE_PLUGINS = 'true';
  Logger.attachBuffer();
  const main = await import('./main.bootstrap');
  const { app, swaggerDocumentFactory } = await main.bootstrap();

  console.log('Creating swagger document');
  const distDir = join(__dirname, '../../apps/api-swagger');
  const swaggerDocument = swaggerDocumentFactory();

  console.log('Writing swagger');
  writeFileSync(join(distDir, 'swagger.json'), JSON.stringify(swaggerDocument, null, 2));

  console.log('Done');
  await app.close();
  process.exit(0);
}

main();
