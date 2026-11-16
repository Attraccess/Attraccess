import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER, AuditRecorder, SYSTEM_AUDIT_ACTOR } from '../../../../audit/recorder/audit-event';
import type { AttractapAuditAction } from '../../../../audit/policies/attractap';

type UiAction = Extract<AttractapAuditAction, `ui.${string}`>;

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
  constructor(@Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder) {}

  async record(action: UiAction, details: UiAuditDetails): Promise<void> {
    await this.audit.record({
      domain: 'attractap',
      action: `attractap.${action}`,
      actor: SYSTEM_AUDIT_ACTOR,
      subject: { type: 'attractap.reader', id: details.readerId },
      details: Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined)) as Record<
        string,
        string | number | boolean
      >,
    });
  }
}
