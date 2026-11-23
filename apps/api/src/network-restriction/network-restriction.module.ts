import { Module } from '@nestjs/common';
import { NetworkRestrictionPersistenceModule } from '../database/adapters/network-restriction/network-restriction-persistence.module';
import { SettingsModule } from '../settings/settings.module';
import { NetworkRestrictionAdministrationService } from './network-restriction-administration.service';
import { NetworkRestrictionConfigService } from './network-restriction-config.service';
import { NetworkRestrictionController } from './network-restriction.controller';
import { NetworkRestrictionService } from './network-restriction.service';

@Module({
  imports: [SettingsModule, NetworkRestrictionPersistenceModule],
  providers: [NetworkRestrictionConfigService, NetworkRestrictionService, NetworkRestrictionAdministrationService],
  controllers: [NetworkRestrictionController],
  exports: [NetworkRestrictionService],
})
export class NetworkRestrictionModule {}
