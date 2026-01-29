import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BleGateway } from '@attraccess/database-entities';
import { MqttMessageEvent } from '../../../mqtt/mqtt-message.event';
import { GatewayAdapterRegistry } from '../gateways/gateway-adapter.registry';
import { GatewayPayloadParseResult, NormalizedGatewayAdvertisement } from '../gateways/gateway-adapter.interface';
import { MqttClientService } from '../../../mqtt/mqtt-client.service';
import { PositionalTrackingService } from '../positional-tracking.service';

export type GatewayMqttResolution = {
  gateway: BleGateway;
  advertisements: NormalizedGatewayAdvertisement[];
};

@Injectable()
export class GatewayMqttRouterService implements OnModuleInit {
  private readonly logger = new Logger(GatewayMqttRouterService.name);

  constructor(
    @InjectRepository(BleGateway)
    private readonly bleGatewayRepository: Repository<BleGateway>,
    private readonly gatewayAdapterRegistry: GatewayAdapterRegistry,
    private readonly mqttClientService: MqttClientService,
    private readonly positionalTrackingService: PositionalTrackingService,
  ) { }

  async onModuleInit(): Promise<void> {
    const gateways = await this.bleGatewayRepository.find();
    if (gateways.length === 0) {
      this.logger.warn('No BLE gateways configured for positional tracking');
      return;
    }

    this.logger.log(`Initializing positional tracking for ${gateways.length} BLE gateway(s)`);
    for (const gateway of gateways) {
      const resolvedTopic = this.resolveTopic(gateway);
      if (!resolvedTopic) {
        this.logger.warn(`Skipping gateway ${gateway.identifier}; unable to resolve topic`);
        continue;
      }
      const qos = gateway.subscribeQos ?? undefined;
      this.logger.debug(
        `Subscribing to gateway ${gateway.identifier} on server ${gateway.mqttServerId} topic ${resolvedTopic}`,
      );
      await this.mqttClientService.subscribe(gateway.mqttServerId, resolvedTopic, qos as 0 | 1 | 2 | undefined).catch(
        (error) => {
          this.logger.error(
            `Failed to subscribe to topic ${resolvedTopic} for server ID ${gateway.mqttServerId}`,
            error.stack,
          );
        },
      );
    }
  }

  @OnEvent(MqttMessageEvent.EVENT_NAME)
  async handleMqttMessage(event: MqttMessageEvent): Promise<void> {
    const resolved = await this.resolveMessage(event);
    if (!resolved) {
      this.logger.debug(`Ignoring MQTT message on ${event.topic} (server ${event.serverId})`);
      return;
    }

    for (const advertisement of resolved.advertisements) {
      await this.positionalTrackingService.processGatewayAdvertisement(
        resolved.gateway,
        advertisement,
      );
    }
  }

  resolveTopic(gateway: BleGateway): string | null {
    const adapter = this.gatewayAdapterRegistry.getAdapter(gateway.type);
    if (!adapter) {
      this.logger.warn(`No adapter registered for gateway type ${gateway.type}`);
      return null;
    }
    const configured = gateway.topic?.trim();
    return configured && configured.length > 0 ? configured : adapter.getDefaultTopic(gateway.identifier);
  }

  async resolveMessage(event: MqttMessageEvent): Promise<GatewayMqttResolution | null> {
    const gateways = await this.bleGatewayRepository.findBy({ mqttServerId: event.serverId });
    if (gateways.length === 0) {
      this.logger.warn(`No gateways configured for server ${event.serverId}`);
      return null;
    }
    const matchedGateways = gateways.filter((gateway) => {
      const topic = this.resolveTopic(gateway);
      return topic ? this.topicMatches(topic, event.topic) : false;
    });

    if (matchedGateways.length === 0) {
      this.logger.warn(`No gateways matched topic ${event.topic} on server ${event.serverId}`);
      return null;
    }

    let selectedGateway: BleGateway | null = null;
    let selectedParsed: GatewayPayloadParseResult | null = null;
    for (const gateway of matchedGateways) {
      const adapter = this.gatewayAdapterRegistry.getAdapter(gateway.type);
      if (!adapter) {
        this.logger.warn(`No gateway adapter registered for type ${gateway.type}`);
        continue;
      }
      const parsed = adapter.parsePayload(event.payload);
      if (parsed) {
        selectedGateway = gateway;
        selectedParsed = parsed;
        break;
      }
    }

    if (!selectedGateway || !selectedParsed) {
      if (matchedGateways.length > 1) {
        this.logger.warn(
          `Multiple gateways matched topic ${event.topic} on server ${event.serverId}; none parsed payload`,
        );
      }

      this.logger.warn("no selected gateway or parsed payload");
      return null;
    }
    const gateway = selectedGateway;
    const parsed = selectedParsed;
    if (parsed.gatewayIdentifier && parsed.gatewayIdentifier !== gateway.identifier) {
      this.logger.warn(
        `Gateway identifier mismatch for topic ${event.topic}: expected ${gateway.identifier}, received ${parsed.gatewayIdentifier}`,
      );
      return null;
    }
    return {
      gateway,
      advertisements: parsed.advertisements,
    };
  }

  private topicMatches(filter: string, topic: string): boolean {
    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = filter.split('/').map((segment, index, arr) => {
      if (segment === '+') {
        return '[^/]+';
      }
      if (segment === '#' && index === arr.length - 1) {
        return '.*';
      }
      return escapeRegex(segment);
    });
    const pattern = '^' + parts.join('/') + '$';
    return new RegExp(pattern).test(topic);
  }
}
