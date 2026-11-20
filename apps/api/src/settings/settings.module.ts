import { Module } from '@nestjs/common';
import { SettingsPersistenceModule } from '../database/adapters/settings/settings-persistence.module';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { EncryptionModule } from '../encryption/encryption.module';
import { SettingsStoreService } from './settings-store.service';
import { SmtpSettingsService } from './smtp-settings.service';
import { SettingsAdministrationService } from './settings-administration.service';

@Module({
  imports: [EncryptionModule, SettingsPersistenceModule],
  providers: [SettingsStoreService, SmtpSettingsService, SettingsService, SettingsAdministrationService],
  controllers: [SettingsController],
  exports: [SettingsService, SettingsStoreService],
})
export class SettingsModule {}
