import type { OpenApiDocument } from './openapi-tools';

/**
 * Builds the host OpenAPI document exactly as `main.export-swagger.ts` does: through the real
 * bootstrap with plugins disabled. Nothing is read from a `dist` artifact, so it works on a clean checkout.
 */
export async function buildHostOpenApiDocument(): Promise<OpenApiDocument> {
  process.env.DISABLE_PLUGINS = 'true';
  process.env.AUTH_SESSION_SECRET ??= 'mcp-openapi-document-session-secret-0123456789';
  // Never let a developer's own .env or deployment URL change the exported operation set.
  process.env.NODE_ENV = 'test';
  const { bootstrap } = await import('../main.bootstrap');
  const { app, swaggerDocumentFactory } = await bootstrap();
  try {
    return JSON.parse(JSON.stringify(swaggerDocumentFactory())) as OpenApiDocument;
  } finally {
    await app.close();
  }
}
