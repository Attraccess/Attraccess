import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MqttServer } from '@attraccess/database-entities';
import { MqttServerController } from './servers/mqtt-server.controller';
import { MqttServerService } from './servers/mqtt-server.service';
import { MqttClientService } from './mqtt-client.service';
import { MqttMonitoringService } from './mqtt-monitoring.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [TypeOrmModule.forFeature([MqttServer]), ConfigModule],
  controllers: [MqttServerController],
  providers: [MqttServerService, MqttClientService, MqttMonitoringService],
  exports: [MqttClientService, MqttMonitoringService],
})
export class MqttModule {}
