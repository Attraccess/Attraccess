import { Injectable, NotFoundException } from '@nestjs/common';
import { MqttServerConnectionConfig, MqttServerHostProvider } from '@attraccess/plugins-backend-sdk';
import { MqttServerService } from './servers/mqtt-server.service';

/**
 * Generic, broker-agnostic bridge that lets permitted plugins read an MQTT
 * server's connection config and resolved credentials. All decryption happens
 * here on the core side via MqttServerService.findOne; the plugin only ever
 * receives the mapped MqttServerConnectionConfig. Registered under
 * MQTT_SERVER_HOST_PROVIDER and reached only through
 * PluginContext.getMqttServerConfig, which is gated by ACCESS_MQTT_SERVERS.
 */
@Injectable()
export class MqttServerHostProviderService implements MqttServerHostProvider {
  constructor(private readonly mqttServerService: MqttServerService) {}

  async getServerConfig(serverId: number): Promise<MqttServerConnectionConfig | null> {
    let server;
    try {
      server = await this.mqttServerService.findOne(serverId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }

    return {
      id: server.id,
      name: server.name,
      host: server.host,
      port: server.port,
      useTls: server.useTls,
      caCert: server.caCert,
      tlsInsecure: server.tlsInsecure,
      tlsServername: server.tlsServername,
      username: server.username,
      password: server.password,
      clientId: server.clientId,
    };
  }
}
