import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MqttServer } from '@attraccess/database-entities';
import { MQTT_SERVER_HOST_PROVIDER } from '@attraccess/plugins-backend-sdk';
import { MqttServerController } from './servers/mqtt-server.controller';
import { MqttServerService } from './servers/mqtt-server.service';
import { MqttClientService } from './mqtt-client.service';
import { MqttServerHostProviderService } from './mqtt-server-host.provider';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [TypeOrmModule.forFeature([MqttServer]), ConfigModule],
  controllers: [MqttServerController],
  providers: [
    MqttServerService,
    MqttClientService,
    MqttServerHostProviderService,
    { provide: MQTT_SERVER_HOST_PROVIDER, useExisting: MqttServerHostProviderService },
  ],
  exports: [MqttClientService, MQTT_SERVER_HOST_PROVIDER],
})
export class MqttModule {}
