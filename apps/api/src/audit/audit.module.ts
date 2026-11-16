import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { PLUGIN_AUDIT_HOST_PROVIDER } from '@attraccess/plugins-backend-sdk';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';
import { PluginAuditHost } from './plugin-audit-host';
import { AUDIT_RECORDER } from './recorder/audit-event';

/** Global, so domain modules depend only on the AUDIT_RECORDER port and never import this module. */
@Global()
@Module({
  imports: [SettingsModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditQueryService,
    { provide: AUDIT_RECORDER, useExisting: AuditService },
    { provide: PLUGIN_AUDIT_HOST_PROVIDER, useClass: PluginAuditHost },
  ],
  exports: [AUDIT_RECORDER, AuditQueryService, PLUGIN_AUDIT_HOST_PROVIDER],
})
export class AuditModule {}
