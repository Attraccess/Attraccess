import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceFlowNode, ResourceFlowEdge, Resource, ResourceFlowLog } from '@attraccess/database-entities';
import { ResourceFlowsController } from './resource-flows.controller';
import { ResourceFlowsService } from './resource-flows.service';
import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ConfigModule } from '@nestjs/config';
import flowConfig from './flow.config';
import { MqttModule } from '../../mqtt/mqtt.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceFlowNode, ResourceFlowEdge, Resource, ResourceFlowLog]),
    ConfigModule.forFeature(flowConfig),
    MqttModule,
  ],
  controllers: [ResourceFlowsController],
  providers: [ResourceFlowsService, ResourceFlowsExecutorService],
  exports: [ResourceFlowsService],
})
export class ResourceFlowsModule {}
