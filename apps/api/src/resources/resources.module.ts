import { Module } from '@nestjs/common';
import { ResourcesController } from './resources.controller';
import { FileStorageModule } from '../common/modules/file-storage.module';
import { UsersAndAuthModule } from '../users-and-auth/users-and-auth.module';
import { ConfigModule } from '@nestjs/config';
import { MqttModule } from '../mqtt/mqtt.module';
import { SSEModule } from './sse/sse.module';
import { ResourceGroupsModule } from './groups/resourceGroups.module';
import { ResourcesService } from './resources.service';
import { ResourceUsageModule } from './usage/resourceUsage.module';
import { ResourceMeteringApiModule } from './metering/resource-metering-api.module';
import { SupervisionModule } from './supervision/supervision.module';
import { MassIntroductionModule } from './mass-introductions/mass-introduction.module';
import { ResourceImageService } from './resourceImage.service';
import { ResourceIntroductionsModule } from './introductions/resourceIntroductions.module';
import { ResourceIntroducersModule } from './introducers/resourceIntroducers.module';
import { ResourceFlowsModule } from './flows/resource-flows.module';
import { ResourceMaintenanceModule } from './maintenances/maintenance.module';
import { ResourceFormsModule } from './forms/forms.module';
import { ResourceHealthModule } from './health/resource-health.module';
import { LicenseModule } from '../license/license.module';
import { LiveTopicsModule } from '../live-updates/live-topics.module';
import { ResourcesPersistenceModule } from '../database/adapters/resources/resources-persistence.module';
import { ResourceLiveTopicsProvider } from './resource-live-topics.provider';
import { ResourceListVisibilityModule } from './visibility/resource-list-visibility.module';

@Module({
  imports: [
    ResourceListVisibilityModule,
    ResourcesPersistenceModule,
    FileStorageModule,
    UsersAndAuthModule,
    ConfigModule,
    MqttModule,
    SSEModule,
    ResourceGroupsModule,
    ResourceUsageModule,
    FileStorageModule,
    ResourceIntroductionsModule,
    ResourceIntroducersModule,
    ResourceUsageModule,
    SupervisionModule,
    MassIntroductionModule,
    ResourceFlowsModule,
    ResourceMeteringApiModule,
    ResourceMaintenanceModule,
    ResourceFormsModule,
    ResourceHealthModule,
    LicenseModule,
    LiveTopicsModule,
  ],
  controllers: [ResourcesController],
  providers: [ResourcesService, ResourceImageService, ResourceLiveTopicsProvider],
  exports: [ResourcesService, ResourceImageService],
})
export class ResourcesModule {}
