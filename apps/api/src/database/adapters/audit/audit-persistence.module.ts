import { Module } from '@nestjs/common';
import { AUDIT_STORE } from '../../../audit/audit-persistence.port';
import { PostgresAuditStore } from './postgres-audit-store';

/** Provides the audit persistence port with the PostgreSQL adapter. The audit module imports it. */
@Module({
  providers: [{ provide: AUDIT_STORE, useClass: PostgresAuditStore }],
  exports: [AUDIT_STORE],
})
export class AuditPersistenceModule {}
