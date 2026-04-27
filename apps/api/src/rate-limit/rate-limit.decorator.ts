// Method decorator that tags a route with its rate-limit scope and rejection mode
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_METADATA_KEY } from './rate-limit.constants';
import type { RateLimitMetadata } from './rate-limit.types';

export const RateLimit = (metadata: RateLimitMetadata) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, metadata);
