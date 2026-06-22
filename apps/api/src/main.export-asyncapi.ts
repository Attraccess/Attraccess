/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AsyncApiDocumentBuilder, AsyncApiModule } from 'nestjs-asyncapi';
import { CompanionGateway } from './companion/companion.gateway';
import { CompanionService } from './companion/companion.service';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Minimal module — only what the scanner needs; CompanionService stubbed so no DB is required
@Module({ providers: [CompanionGateway, { provide: CompanionService, useValue: {} }] })
class AsyncApiExportModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(AsyncApiExportModule, { logger: false });

  const config = new AsyncApiDocumentBuilder()
    .setTitle('Attraccess Companion WebSocket API')
    .setDescription('WebSocket protocol between the Companion desktop app and the Attraccess server')
    .setVersion('1.0.0')
    .setDefaultContentType('application/json')
    .addServer('companion', {
      url: '{serverUrl}/api/companion/websocket',
      protocol: 'ws',
      description: 'Companion WebSocket endpoint — replace {serverUrl} with the Attraccess server URL',
    })
    .build();

  const document = AsyncApiModule.createDocument(app, config);

  const outDir = join(__dirname, '../api');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'asyncapi.json'), JSON.stringify(document, null, 2));
  console.log('AsyncAPI spec written to dist/apps/api/asyncapi.json');

  await app.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
