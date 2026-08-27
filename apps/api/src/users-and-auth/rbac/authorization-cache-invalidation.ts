import { randomUUID } from 'crypto';

export const AUTHORIZATION_CACHE_INVALIDATION_CHANNEL = 'attraccess:authorization-cache-invalidation';
export const authorizationCacheInvalidationSource = randomUUID();

export interface AuthorizationCacheInvalidationMessage {
  source: string;
  userId?: number;
}
