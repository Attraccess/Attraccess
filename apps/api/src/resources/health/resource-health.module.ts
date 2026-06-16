import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MqttServer,
  Resource,
  ResourceFlowNode,
  ResourceHealthState,
  ResourceIntroducer,
  User,
} from '@attraccess/database-entities';
import { ResourceHealthService } from './resource-health.service';
import { ResourceHealthController } from './resource-health.controller';
import { ResourceMaintenanceModule } from '../maintenances/maintenance.module';
import { ResourceHealthNotificationListener } from './resource-health-notification.listener';
import { MqttServerConnectionHealthListener } from './mqtt-server-connection-health.listener';
import { EmailModule } from '../../email/email.module';
import { MqttModule } from '../../mqtt/mqtt.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceHealthState, Resource, ResourceIntroducer, User, ResourceFlowNode, MqttServer]),
    ResourceMaintenanceModule,
    EmailModule,
    MqttModule,
  ],
  controllers: [ResourceHealthController],
  providers: [ResourceHealthService, ResourceHealthNotificationListener, MqttServerConnectionHealthListener],
  exports: [ResourceHealthService],
})
export class ResourceHealthModule {}
