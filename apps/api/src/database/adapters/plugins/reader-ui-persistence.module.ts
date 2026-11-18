import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ReaderUiAlert,
  ReaderUiPluginSettings,
  ReaderUiReaderSettings,
  ReaderUiResourceSettings,
} from '@attraccess/database-entities';
import { READER_UI_ALERT_STORE } from '../../../plugin-system/reader-ui/reader-ui-alerts.port';
import { READER_UI_SETTINGS_STORE } from '../../../plugin-system/reader-ui/reader-ui-settings.port';
import { ReaderUiAlertsAdapter } from './reader-ui-alerts.adapter';
import { ReaderUiSettingsAdapter } from './reader-ui-settings.adapter';

/** Provides the reader UI settings and alert stores on the TypeORM backend. */
@Module({
  imports: [
    TypeOrmModule.forFeature([ReaderUiAlert, ReaderUiPluginSettings, ReaderUiReaderSettings, ReaderUiResourceSettings]),
  ],
  providers: [
    ReaderUiAlertsAdapter,
    ReaderUiSettingsAdapter,
    { provide: READER_UI_ALERT_STORE, useExisting: ReaderUiAlertsAdapter },
    { provide: READER_UI_SETTINGS_STORE, useExisting: ReaderUiSettingsAdapter },
  ],
  exports: [READER_UI_ALERT_STORE, READER_UI_SETTINGS_STORE],
})
export class ReaderUiPersistenceModule {}
