import { Injectable, Logger } from '@nestjs/common';

export type AuthAuditType = 'login' | 'register' | 'password_reset_request' | 'password_reset_complete';

export type AuthAuditOutcome =
  | 'success'
  | 'invalid_credentials'
  | 'account_locked'
  | 'rate_limited'
  | 'two_factor_required'
  | 'two_factor_invalid'
  | 'email_not_verified'
  | 'invalid_token'
  | 'invalid_input'
  | 'unknown_user';

export interface AuthAuditFields {
  type: AuthAuditType;
  outcome: AuthAuditOutcome;
  ip: string;
  userId?: number | null;
  username?: string | null;
  reason?: string;
}

@Injectable()
export class AuthAuditLogger {
  private readonly logger = new Logger('AuthAudit');

  log(fields: AuthAuditFields): void {
    const line = formatLine(fields);
    if (fields.outcome === 'success') {
      this.logger.log(line);
    } else {
      this.logger.warn(line);
    }
  }
}

function formatLine(fields: AuthAuditFields): string {
  const parts: string[] = [];
  const prefix = fields.outcome === 'success' ? 'auth.success' : 'auth.failed';
  parts.push(prefix);
  parts.push(`type=${fields.type}`);
  parts.push(`outcome=${fields.outcome}`);
  parts.push(`ip=${sanitize(fields.ip)}`);
  parts.push(`user_id=${fields.userId == null ? '-' : String(fields.userId)}`);
  parts.push(`username=${sanitize(fields.username ?? '-')}`);
  parts.push(`ts=${new Date().toISOString()}`);
  if (fields.reason) {
    parts.push(`reason=${sanitize(fields.reason)}`);
  }
  return parts.join(' ');
}

function sanitize(value: string): string {
  return String(value).replace(/[\s"]+/g, '_');
}
