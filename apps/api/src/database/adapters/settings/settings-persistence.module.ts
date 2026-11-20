import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersistenceCoreModule } from '../common/persistence-core.module';
import { Setting, User } from '@attraccess/database-entities';
import { SETTINGS_ROWS, SETUP_ACCOUNT_STATS } from '../../../settings/settings-rows.port';
import { TypeOrmSettingsRows, TypeOrmSetupAccountStats } from './typeorm-settings-rows';

@Module({
  imports: [PersistenceCoreModule, TypeOrmModule.forFeature([Setting, User])],
  providers: [
    { provide: SETTINGS_ROWS, useClass: TypeOrmSettingsRows },
    { provide: SETUP_ACCOUNT_STATS, useClass: TypeOrmSetupAccountStats },
  ],
  exports: [SETTINGS_ROWS, SETUP_ACCOUNT_STATS],
})
export class SettingsPersistenceModule {}
