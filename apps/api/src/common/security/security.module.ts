import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SettingsModule } from '../../settings/settings.module';
import { ApprovedOriginsService } from './approved-origins.service';
import { CrossSiteWriteGuard } from './cross-site-write.guard';

@Global()
@Module({
  imports: [SettingsModule],
  providers: [ApprovedOriginsService, { provide: APP_GUARD, useClass: CrossSiteWriteGuard }],
  exports: [ApprovedOriginsService],
})
export class SecurityModule {}
