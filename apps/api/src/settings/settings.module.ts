import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting, User } from '@attraccess/database-entities';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { EncryptionModule } from '../encryption/encryption.module';
import { ConfigModule } from '@nestjs/config';
import { SettingsStoreService } from './settings-store.service';
import { AppSettingsService } from './app-settings.service';
import { SmtpSettingsService } from './smtp-settings.service';

@Module({
  imports: [ConfigModule, EncryptionModule, TypeOrmModule.forFeature([Setting, User])],
  providers: [SettingsStoreService, AppSettingsService, SmtpSettingsService, SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
