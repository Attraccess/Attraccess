import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Resource,
  ResourceUsage,
  ResourceIntroduction,
  ResourceIntroducer,
  ResourceIntroductionHistoryItem,
  User,
} from '@attraccess/database-entities';
import { ResourcesController } from './resources.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { FileStorageModule } from '../common/modules/file-storage.module';
import { UsersAndAuthModule } from '../users-and-auth/users-and-auth.module';
import { ConfigModule } from '@nestjs/config';
import { MqttModule } from '../mqtt/mqtt.module';
import { SSEModule } from './sse/sse.module';
import { ResourceGroupsModule } from './groups/resourceGroups.module';
import { ResourcesService } from './resources.service';
import { ResourceUsageModule } from './usage/resourceUsage.module';
import { ResourceImageService } from './resourceImage.service';
import { ResourceIntroductionsModule } from './introductions/resourceIntroductions.module';
import { ResourceIntroducersModule } from './introducers/resourceIntroducers.module';
import { ResourceFlowsModule } from './flows/resource-flows.module';
import { ResourceMaintenanceModule } from './maintenances/maintenance.module';
import { LicenseModule } from '../license/license.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Resource,
      ResourceUsage,
      ResourceIntroduction,
      ResourceIntroducer,
      ResourceIntroductionHistoryItem,
      User,
    ]),
    ScheduleModule.forRoot(),
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
    ResourceFlowsModule,
    ResourceMaintenanceModule,
    LicenseModule,
  ],
  controllers: [ResourcesController],
  providers: [ResourcesService, ResourceImageService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
