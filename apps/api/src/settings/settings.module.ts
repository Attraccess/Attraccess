import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting, User } from '@attraccess/database-entities';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { EncryptionModule } from '../encryption/encryption.module';
import { SettingsStoreService } from './settings-store.service';
import { SmtpSettingsService } from './smtp-settings.service';

@Module({
  imports: [EncryptionModule, TypeOrmModule.forFeature([Setting, User])],
  providers: [SettingsStoreService, SmtpSettingsService, SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService, SettingsStoreService],
})
export class SettingsModule {}
