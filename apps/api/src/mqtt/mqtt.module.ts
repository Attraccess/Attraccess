import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MqttServer } from '@attraccess/database-entities';
import { MQTT_CREDENTIAL_PROVISIONING_HOST_PROVIDER, MQTT_SERVER_HOST_PROVIDER } from '@attraccess/plugins-backend-sdk';
import { MqttServerController } from './servers/mqtt-server.controller';
import { MqttServerService } from './servers/mqtt-server.service';
import { MqttClientService } from './mqtt-client.service';
import { MqttServerHostProviderService } from './mqtt-server-host.provider';
import { ConfigModule } from '@nestjs/config';
import { LiveTopicsModule } from '../live-updates/live-topics.module';
import { MqttExplorerController } from './explorer/mqtt-explorer.controller';
import { MqttExplorerConnectionsService } from './explorer/mqtt-explorer-connections.service';
import { MqttExplorerLiveTopicsProvider } from './explorer/mqtt-explorer.live-topics.provider';
import { MqttExplorerService } from './explorer/mqtt-explorer.service';
import { MqttCredentialProvisioningService } from './mqtt-credential-provisioning.service';

@Module({
  imports: [TypeOrmModule.forFeature([MqttServer]), ConfigModule, LiveTopicsModule],
  controllers: [MqttServerController, MqttExplorerController],
  providers: [
    MqttServerService,
    MqttClientService,
    MqttServerHostProviderService,
    MqttCredentialProvisioningService,
    MqttExplorerConnectionsService,
    MqttExplorerService,
    MqttExplorerLiveTopicsProvider,
    { provide: MQTT_SERVER_HOST_PROVIDER, useExisting: MqttServerHostProviderService },
    { provide: MQTT_CREDENTIAL_PROVISIONING_HOST_PROVIDER, useExisting: MqttCredentialProvisioningService },
  ],
  exports: [MqttClientService, MQTT_SERVER_HOST_PROVIDER, MQTT_CREDENTIAL_PROVISIONING_HOST_PROVIDER],
})
export class MqttModule {}
