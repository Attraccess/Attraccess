import { Injectable } from '@nestjs/common';
import { AuditService } from './audit.service';
import { SsoAuditEvent } from './audit-policy';

/** Injectable boundary for SSO administration and provider-origin provisioning events. */
@Injectable()
export class SsoAuditService {
  constructor(private readonly audit: AuditService) {}

  record(event: SsoAuditEvent) {
    return this.audit.recordSso(event);
  }
}
