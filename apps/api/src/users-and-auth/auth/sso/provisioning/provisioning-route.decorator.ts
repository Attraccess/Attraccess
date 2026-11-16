import { applyDecorators, Type } from '@nestjs/common';

import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

interface ProvisioningRouteDocs {
  summary: string;
  operationId: string;
  /** How the route names its shared secret, e.g. `SSO client secret`. */
  secret: string;
  body: Type<unknown>;
  /** What a 200 response means. */
  done: string;
}

/** OpenAPI documentation of an identity-provider provisioning route that is called with the provider's secret. */
export function ApiProvisioningRoute({ summary, operationId, secret, body, done }: ProvisioningRouteDocs) {
  // Listed top to bottom as they would be stacked on the method; stacked decorators apply bottom-up.
  return applyDecorators(
    ...[
      ApiOperation({ summary, operationId }),
      ApiParam({
        name: 'providerId',
        type: 'string',
        description: 'The ID of the SSO provider',
      }),
      ApiHeader({
        name: 'Authorization',
        required: false,
        description: `Bearer <${secret}> (or use x-api-key)`,
      }),
      ApiHeader({
        name: 'x-api-key',
        required: false,
        description: `${secret} (alternative to Authorization header)`,
      }),
      ApiBody({ type: body }),
      ApiResponse({
        status: 200,
        description: done,
        schema: {
          type: 'object',
          properties: {
            OK: { type: 'boolean' },
          },
        },
      }),
      ApiResponse({ status: 401, description: 'Missing or wrong provisioning secret, or no secret configured' }),
      ApiResponse({ status: 429, description: 'Too many failed secret checks from this IP for this provider' }),
    ].reverse(),
  );
}
