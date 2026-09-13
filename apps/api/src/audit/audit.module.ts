import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { PLUGIN_AUDIT_HOST_PROVIDER } from '@attraccess/plugins-backend-sdk';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { IdentityAuditService } from './identity-audit.service';

@Global()
@Module({
  imports: [SettingsModule],
  controllers: [AuditController],
  providers: [AuditService, IdentityAuditService, { provide: PLUGIN_AUDIT_HOST_PROVIDER, useExisting: AuditService }],
  exports: [AuditService, IdentityAuditService, PLUGIN_AUDIT_HOST_PROVIDER],
})
export class AuditModule {}
