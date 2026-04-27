// Public rate-limit scopes, modes, decorator metadata shape, and helper return types
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

export type RateLimitScope = 'login' | 'emailTrigger' | 'tokenAction';

export type RateLimitMode = '429' | 'silentOk';

export interface RateLimitMetadata {
  scope: RateLimitScope;
  mode: RateLimitMode;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}
