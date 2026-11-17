import { Module } from '@nestjs/common';
import { AUDIT_STORE } from '../../../audit/audit-persistence.port';
import { SqliteAuditStore } from './sqlite-audit-store';

/** Provides the audit persistence port with the SQLite adapter. The audit module imports it. */
@Module({
  providers: [{ provide: AUDIT_STORE, useClass: SqliteAuditStore }],
  exports: [AUDIT_STORE],
})
export class AuditPersistenceModule {}
