import { SetMetadata } from '@nestjs/common';
import { RateLimitScope } from './brute-force.service';

export const AUTH_RATE_LIMIT_METADATA = 'auth_rate_limit_scope';
export const AUTH_RATE_LIMIT_OPTIONS_METADATA = 'auth_rate_limit_options';

export interface AuthRateLimitOptions {
  clearFailuresOnSuccess?: boolean;
}

export const AuthRateLimit = (scope: RateLimitScope, options: AuthRateLimitOptions = {}): MethodDecorator => {
  const setScope = SetMetadata(AUTH_RATE_LIMIT_METADATA, scope);
  const setOptions = SetMetadata(AUTH_RATE_LIMIT_OPTIONS_METADATA, options);

  return (target, propertyKey, descriptor) => {
    setScope(target, propertyKey, descriptor);
    setOptions(target, propertyKey, descriptor);
  };
};
