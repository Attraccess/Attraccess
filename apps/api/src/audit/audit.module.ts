import { SqliteTransactionDriver } from '../database/sqlite/transactions';
import { DataSource } from 'typeorm';
import { AUDIT_COMMIT_BOUNDARY, AuditPersistence, AuditTransactionObserver } from './persistence/port';
import { SqliteAuditPersistence } from './persistence/sqlite-audit-storage';
import { SqliteAuditTransactionObserver } from './persistence/transaction-observer';
import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { PLUGIN_AUDIT_HOST_PROVIDER } from '@attraccess/plugins-backend-sdk/v2';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { IdentityAuditService } from './identity-audit.service';
import { SsoAuditService } from './sso-audit.service';

@Global()
@Module({
  imports: [SettingsModule],
  controllers: [AuditController],
  providers: [
    {
      provide: AuditPersistence,
      useFactory: (source: DataSource) => new SqliteAuditPersistence(source),
      inject: [DataSource],
    },
    {
      provide: AuditTransactionObserver,
      useFactory: (source: DataSource, driver: SqliteTransactionDriver) => {
        const observer = new SqliteAuditTransactionObserver(source);
        driver.register(AUDIT_COMMIT_BOUNDARY, (manager) => observer.bind(manager));
        return observer;
      },
      inject: [DataSource, SqliteTransactionDriver],
    },
    AuditService,
    IdentityAuditService,
    SsoAuditService,
    { provide: PLUGIN_AUDIT_HOST_PROVIDER, useExisting: AuditService },
  ],
  exports: [AuditService, IdentityAuditService, SsoAuditService, PLUGIN_AUDIT_HOST_PROVIDER],
})
export class AuditModule {}
