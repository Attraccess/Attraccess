import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource, ResourceHealthState, ResourceIntroducer, User } from '@attraccess/database-entities';
import { ResourceHealthService } from './resource-health.service';
import { ResourceHealthController } from './resource-health.controller';
import { ResourceMaintenanceModule } from '../maintenances/maintenance.module';
import { ResourceHealthNotificationListener } from './resource-health-notification.listener';
import { EmailModule } from '../../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceHealthState, Resource, ResourceIntroducer, User]),
    ResourceMaintenanceModule,
    EmailModule,
  ],
  controllers: [ResourceHealthController],
  providers: [ResourceHealthService, ResourceHealthNotificationListener],
  exports: [ResourceHealthService],
})
export class ResourceHealthModule {}
