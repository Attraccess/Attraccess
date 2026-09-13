import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IdentityAuditService } from '../../audit/identity-audit.service';

export type AuthAuditType =
  'login' | 'register' | 'password_reset_request' | 'password_reset_complete' | 'delete_account_confirm' | 'api_token';

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
  | 'unknown_user'
  | 'dependency_failure';

export interface AuthAuditFields {
  type: AuthAuditType;
  outcome: AuthAuditOutcome;
  ip: string;
  userId?: number | null;
  username?: string | null;
  authenticationMethod?: 'session' | 'api-token';
  apiTokenId?: number | null;
  reason?: string;
}

@Injectable()
export class AuthAuditLogger {
  constructor(@Optional() private readonly identityAudit?: IdentityAuditService) {}

  log(fields: AuthAuditFields): void {
    const action = actionFor(fields.type);
    if (!action) return;
    const reason = fields.outcome === 'success' ? undefined : fields.outcome;
    void this.identityAudit
      ?.record({
        action,
        operationId: randomUUID(),
        outcome: fields.outcome === 'success' ? 'succeeded' : 'failed',
        actorId: fields.userId ?? undefined,
        subjectId: fields.userId ?? undefined,
        details: reason ? { reason } : {},
        request: { ipAddress: fields.ip },
      })
      .catch(() => undefined);
  }
}

function actionFor(type: AuthAuditType) {
  if (type === 'login') return 'login' as const;
  if (type === 'register') return 'registration' as const;
  if (type === 'password_reset_request') return 'password_reset_requested' as const;
  if (type === 'password_reset_complete') return 'password_reset_completed' as const;
  return null;
}
