import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditService } from './audit.service';
import { SsoAuditEvent } from './audit-policy';

/** Injectable boundary for SSO administration and provider-origin provisioning events. */
@Injectable()
export class SsoAuditService {
  constructor(private readonly audit: AuditService) {}

  record(event: SsoAuditEvent, transaction?: EntityManager) {
    return this.audit.recordSso(event, transaction);
  }
}
