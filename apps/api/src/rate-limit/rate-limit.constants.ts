// Holds default rate-limit thresholds and DB setting keys for unauth routes
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

export const RATE_LIMIT_PARENT = 'rateLimit';

export const RATE_LIMIT_KEYS = {
  ipLoginWindowSeconds: 'ip_login_window_seconds',
  ipLoginMaxRequests: 'ip_login_max_requests',
  ipEmailTriggerWindowSeconds: 'ip_email_trigger_window_seconds',
  ipEmailTriggerMaxRequests: 'ip_email_trigger_max_requests',
  ipTokenActionWindowSeconds: 'ip_token_action_window_seconds',
  ipTokenActionMaxRequests: 'ip_token_action_max_requests',
  accountVerifyResendCooldownSeconds: 'account_verify_resend_cooldown_seconds',
  accountPasswordResetCooldownSeconds: 'account_password_reset_cooldown_seconds',
  accountLoginMaxFailures: 'account_login_max_failures',
  accountLoginLockSeconds: 'account_login_lock_seconds',
} as const;

export const RATE_LIMIT_DEFAULTS = {
  ipLoginWindowSeconds: 60,
  ipLoginMaxRequests: 10,
  ipEmailTriggerWindowSeconds: 900,
  ipEmailTriggerMaxRequests: 5,
  ipTokenActionWindowSeconds: 900,
  ipTokenActionMaxRequests: 20,
  accountVerifyResendCooldownSeconds: 60,
  accountPasswordResetCooldownSeconds: 60,
  accountLoginMaxFailures: 10,
  accountLoginLockSeconds: 900,
} as const;

export const RATE_LIMIT_METADATA_KEY = 'attraccess.rateLimit';

export const RATE_LIMIT_IP_BUCKET_CAP = 10_000;

export const RATE_LIMIT_SILENT_OK_BODY = { message: 'OK' } as const;
