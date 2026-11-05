import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ReaderUiAlert,
  ReaderUiPluginSettings,
  ReaderUiReaderSettings,
  ReaderUiResourceSettings,
} from '@attraccess/database-entities';
import { AuditModule } from '../../audit/audit.module';
import { ReaderUiAlertsService } from './reader-ui-alerts.service';
import { ReaderUiHooksService } from './reader-ui-hooks.service';
import { ReaderUiSettingsService } from './reader-ui-settings.service';
import { ReaderUiRegistry } from './reader-ui.registry';

/** Plugin reader UI registry, hook runner, admin settings and alerts. Plugins register through the registry. */
@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([ReaderUiAlert, ReaderUiPluginSettings, ReaderUiReaderSettings, ReaderUiResourceSettings]),
  ],
  providers: [ReaderUiRegistry, ReaderUiAlertsService, ReaderUiSettingsService, ReaderUiHooksService],
  exports: [ReaderUiRegistry, ReaderUiAlertsService, ReaderUiSettingsService, ReaderUiHooksService],
})
export class ReaderUiModule {}
