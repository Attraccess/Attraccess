import type { OpenApiDocument } from './openapi-tools';

/**
 * Builds the host OpenAPI document exactly as `main.export-swagger.ts` does: through the real
 * bootstrap with plugins disabled. Nothing is read from a `dist` artifact, so it works on a clean checkout.
 * Like `api:export-swagger` it runs offline (SKIP_DATABASE_MIGRATIONS=true, no DATABASE_URL; see
 * database-connection.module), so it never connects to or migrates a database.
 */
export async function buildHostOpenApiDocument(): Promise<OpenApiDocument> {
  process.env.DISABLE_PLUGINS = 'true';
  process.env.AUTH_SESSION_SECRET ??= 'mcp-openapi-document-session-secret-0123456789';
  // Never let a developer's own .env or deployment URL change the exported operation set.
  process.env.NODE_ENV = 'test';
  process.env.SKIP_DATABASE_MIGRATIONS = 'true';
  // Empty rather than deleted: a deleted key would be filled from the developer's .env when the config loads.
  process.env.DATABASE_URL = '';
  const { bootstrap } = await import('../main.bootstrap');
  const { app, swaggerDocumentFactory } = await bootstrap();
  try {
    return JSON.parse(JSON.stringify(swaggerDocumentFactory())) as OpenApiDocument;
  } finally {
    await app.close();
  }
}
