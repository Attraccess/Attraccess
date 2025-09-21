/* eslint-disable no-console */

import { generateApi } from 'swagger-typescript-api';
import * as path from 'path';
import { readFileSync } from 'fs';

async function generate() {
  console.log('Generating API Client...');

  const swaggerJsonPath = path.resolve(__dirname, '../../../dist/apps/api-swagger/swagger.json');
  const outputPath = path.resolve(__dirname, '../src/generated');

  console.log('Swagger JSON path:', swaggerJsonPath);
  console.log('Output path:', outputPath);

  const swaggerSpec = JSON.parse(readFileSync(swaggerJsonPath, 'utf8'));

  await generateApi({
    output: outputPath,
    spec: swaggerSpec,
    httpClientType: 'fetch', // or 'axios'
    moduleNameFirstTag: true,
    generateClient: true,
    generateRouteTypes: true,
    extractRequestParams: true,
    extractRequestBody: true,
    extractResponseBody: true,
    extractResponseError: true,
  });

  console.log('API Client generated successfully!');
}

generate().catch(console.error);
