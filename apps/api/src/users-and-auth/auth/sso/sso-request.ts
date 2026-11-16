import { Request } from 'express';

import { InvalidSSOProviderIdException } from './errors';

/** The numeric provider id of an SSO route; anything else is a 400. */
export function parseProviderId(rawProviderId: string): number {
  const providerId = parseInt(rawProviderId, 10);
  if (Number.isNaN(providerId)) {
    throw new InvalidSSOProviderIdException();
  }
  return providerId;
}

/** The provisioning secret from `Authorization: Bearer <secret>` or `x-api-key`. */
export function extractProvisioningToken(request: Request): string | null {
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.substring(7).trim();
  }

  const apiKeyHeader = request.headers['x-api-key'];
  if (Array.isArray(apiKeyHeader)) {
    return apiKeyHeader.length > 0 ? apiKeyHeader[0].trim() : null;
  }
  if (typeof apiKeyHeader === 'string') {
    return apiKeyHeader.trim();
  }

  return null;
}
