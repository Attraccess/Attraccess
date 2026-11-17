import { Module } from '@nestjs/common';
import { ReaderUiPersistenceModule } from '../../database/adapters/plugins/reader-ui-persistence.module';
import { ResourceTransactionsModule } from '../../database/resource-transactions.module';
import { ReaderUiAlertsService } from './reader-ui-alerts.service';
import { ReaderUiHooksService } from './reader-ui-hooks.service';
import { ReaderUiSettingsService } from './reader-ui-settings.service';
import { ReaderUiRegistry } from './reader-ui.registry';

/** Plugin reader UI registry, hook runner, admin settings and alerts. Plugins register through the registry. */
@Module({
  imports: [ReaderUiPersistenceModule, ResourceTransactionsModule],
  providers: [ReaderUiRegistry, ReaderUiAlertsService, ReaderUiSettingsService, ReaderUiHooksService],
  exports: [ReaderUiRegistry, ReaderUiAlertsService, ReaderUiSettingsService, ReaderUiHooksService],
})
export class ReaderUiModule {}
