import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../audit/audit.service';
import type { AttractapAuditEvent } from '../../../../audit/policies/domain-events';

type UiAction = Extract<AttractapAuditEvent['action'], `ui.${string}`>;

export interface UiAuditDetails {
  plugin: string;
  readerId: number;
  userId: number;
  resourceId: number;
  decision?: 'allow' | 'confirm' | 'block' | 'answered' | 'cancelled' | 'expired' | 'default' | 'failure';
  reasonCode: string;
  cardSessionId?: string;
  origin?: 'reader';
  policy?: 'block' | 'card-confirm' | 'allow-with-warning';
  /** Card-confirm cancelled by another user's tap: who tapped (`userId` stays the step owner). */
  tappedUserId?: number;
}

/** Host audit entries for reader steps, in the core `attractap` domain. Never throws. */
@Injectable()
export class UiAuditService {
  constructor(private readonly audit: AuditService) {}

  record(action: UiAction, details: UiAuditDetails): Promise<void> {
    return this.audit
      .recordAttractap({
        action,
        actorId: null,
        authenticationMethod: null,
        subjectId: details.readerId,
        details: Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined)) as Record<
          string,
          string | number | boolean
        >,
      })
      .catch(() => undefined);
  }
}
