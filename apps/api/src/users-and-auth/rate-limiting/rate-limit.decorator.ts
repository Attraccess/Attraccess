import { SetMetadata } from '@nestjs/common';
import { RateLimitScope } from './brute-force.service';

export const AUTH_RATE_LIMIT_METADATA = 'auth_rate_limit_scope';

export const AuthRateLimit = (scope: RateLimitScope): MethodDecorator =>
  SetMetadata(AUTH_RATE_LIMIT_METADATA, scope);
