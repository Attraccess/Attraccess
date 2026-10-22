import { Module } from '@nestjs/common';
import { SettingsModule } from '../../settings/settings.module';
import { RbacModule } from '../../users-and-auth/rbac/rbac.module';
import { ResourceIntroductionsModule } from '../introductions/resourceIntroductions.module';
import { ResourceIntroducersModule } from '../introducers/resourceIntroducers.module';
import { ResourceGroupsModule } from '../groups/resourceGroups.module';
import { ResourceRetrainingModule } from '../retraining/resourceRetraining.module';
import { ResourceActivityPolicy } from './resource-activity-policy.service';

@Module({
  imports: [
    SettingsModule,
    RbacModule,
    ResourceIntroductionsModule,
    ResourceIntroducersModule,
    ResourceGroupsModule,
    ResourceRetrainingModule,
  ],
  providers: [ResourceActivityPolicy],
  exports: [ResourceActivityPolicy],
})
export class ResourceActivityPolicyModule {}
