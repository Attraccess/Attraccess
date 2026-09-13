import { Injectable } from '@nestjs/common';
import { AuditService } from './audit.service';
import { IdentityAuditEvent } from './audit-policy';

/** Injectable boundary for controllers recording identity-domain audit events. */
@Injectable()
export class IdentityAuditService {
  constructor(private readonly audit: AuditService) {}

  record(event: IdentityAuditEvent) {
    return this.audit.recordIdentity(event);
  }
}
