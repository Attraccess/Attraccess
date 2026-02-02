import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting, User } from '@attraccess/database-entities';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { EncryptionModule } from '../encryption/encryption.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule, EncryptionModule, TypeOrmModule.forFeature([Setting, User])],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
