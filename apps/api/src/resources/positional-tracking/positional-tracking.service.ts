import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Beacon, BeaconType, BleGateway } from '@attraccess/database-entities';
import { MqttClientService } from '../../mqtt/mqtt-client.service';
import { MqttMessageEvent } from '../../mqtt/mqtt-message.event';

type GatewayAdvertisement = {
  mac?: string;
  rssi?: number;
  n?: string;
  ad?: string;
  ts?: number;
};

type GatewayPayload = {
  dev_wifi_sta_mac?: string;
  dev_ble_mac?: string;
  dev_sn?: string;
  dev_id?: string;
  dev_version?: string;
  dev_list?: GatewayAdvertisement[];
};

@Injectable()
export class PositionalTrackingService implements OnModuleInit {
  private readonly logger = new Logger(PositionalTrackingService.name);

  constructor(
    @InjectRepository(Beacon)
    private readonly beaconRepository: Repository<Beacon>,
    @InjectRepository(BleGateway)
    private readonly bleGatewayRepository: Repository<BleGateway>,
    @Inject(MqttClientService)
    private readonly mqttClientService: MqttClientService,
  ) { }

  async onModuleInit(): Promise<void> {
    const gateways = await this.bleGatewayRepository.find();
    if (gateways.length === 0) {
      this.logger.warn('No BLE gateways configured for positional tracking');
      return;
    }

    this.logger.log(`Initializing positional tracking for ${gateways.length} BLE gateway(s)`);
    for (const gateway of gateways) {
      const qos = gateway.subscribeQos ?? undefined;
      this.logger.debug(
        `Subscribing to gateway ${gateway.identifier} on server ${gateway.mqttServerId} topic ${gateway.topic}`,
      );
      await this.mqttClientService.subscribe(gateway.mqttServerId, gateway.topic, qos as 0 | 1 | 2 | undefined).catch(
        (error) => {
          this.logger.error(
            `Failed to subscribe to topic ${gateway.topic} for server ID ${gateway.mqttServerId}`,
            error.stack,
          );
        },
      );
    }
  }

  @OnEvent(MqttMessageEvent.EVENT_NAME)
  async handleMqttMessage(event: MqttMessageEvent): Promise<void> {
    if (!(await this.isRelevantMessage(event.serverId, event.topic))) {
      this.logger.debug(`Ignoring MQTT message on ${event.topic} (server ${event.serverId})`);
      return;
    }

    const payload = event.payload;
    if (!this.isGatewayPayload(payload)) {
      this.logger.debug(`Ignoring MQTT message on ${event.topic}; payload is not a gateway payload`);
      return;
    }

    const gatewayIdentifier = this.getGatewayIdentifier(payload);
    if (!gatewayIdentifier) {
      this.logger.debug(`Skipping MQTT message on ${event.topic}; missing gateway identifier`);
      return;
    }

    const gateway = await this.bleGatewayRepository.findOneBy({ identifier: gatewayIdentifier });
    if (!gateway) {
      this.logger.debug(`Skipping MQTT message; unknown gateway identifier ${gatewayIdentifier}`);
      return;
    }

    this.logger.debug(
      `Processing ${payload.dev_list?.length ?? 0} advertisement(s) for gateway ${gatewayIdentifier}`,
    );

    const advertisements = payload.dev_list ?? [];
    for (const advertisement of advertisements) {
      const adHex = advertisement.ad;
      if (!adHex) {
        continue;
      }

      const battery = this.parseHolyiotBatteryPercentFromHex(adHex);
      if (battery === null) {
        continue;
      }

      const identifier = this.normalizeMac(advertisement.mac);
      if (!identifier) {
        this.logger.debug(`Unable to build beacon identifier for gateway ${gatewayIdentifier}`);
        continue;
      }

      const lastSeenAt = typeof advertisement.ts === 'number' ? new Date(advertisement.ts) : new Date();

      await this.upsertBeacon({
        identifier,
        type: BeaconType.EDDYSTONE,
        gatewayId: gateway.id,
        distanceToGateway: typeof advertisement.rssi === 'number' ? advertisement.rssi : null,
        battery,
        lastSeenAt,
      });
    }
  }

  private isGatewayPayload(payload: unknown): payload is GatewayPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const maybePayload = payload as { dev_list?: unknown };
    return Array.isArray(maybePayload.dev_list);
  }

  private getGatewayIdentifier(payload: GatewayPayload): string | null {
    return payload.dev_ble_mac ?? null;
  }

  private async isRelevantMessage(serverId: number, topic: string): Promise<boolean> {
    const gateways = await this.bleGatewayRepository.findBy({ mqttServerId: serverId });
    return gateways.some((gateway) => this.topicMatches(gateway.topic, topic));
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

  private normalizeMac(mac?: string): string | null {
    if (!mac) {
      return null;
    }
    const normalized = mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private parseHolyiotBatteryPercentFromHex(adHex: string): number | null {
    const bytes = this.hexToBytes(adHex);
    if (!bytes) {
      return null;
    }

    let offset = 0;
    while (offset < bytes.length) {
      const length = bytes[offset];
      if (length === 0) {
        break;
      }
      const nextOffset = offset + length + 1;
      if (nextOffset > bytes.length || offset + 1 >= bytes.length) {
        break;
      }
      const type = bytes[offset + 1];
      if (type === 0x16) {
        const start = offset + 2;
        const end = offset + 1 + length;
        if (end - start + 1 >= 3) {
          const uuid = bytes[start] | (bytes[start + 1] << 8);
          if (uuid === 0x5242) {
            const payloadStart = start + 2;
            if (payloadStart + 1 <= end && bytes[payloadStart] === 0x41) {
              return bytes[payloadStart + 1];
            }
          }
        }
      }
      offset = nextOffset;
    }

    return null;
  }

  private hexToBytes(hex: string): number[] | null {
    const cleaned = hex.trim().replace(/\s+/g, '');
    if (!cleaned || cleaned.length % 2 !== 0 || /[^a-fA-F0-9]/.test(cleaned)) {
      return null;
    }
    const bytes: number[] = [];
    for (let i = 0; i < cleaned.length; i += 2) {
      bytes.push(parseInt(cleaned.slice(i, i + 2), 16));
    }
    return bytes;
  }

  private async upsertBeacon(data: Omit<Beacon, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const existing = await this.beaconRepository.findOneBy({
      type: data.type,
      identifier: data.identifier,
      gatewayId: data.gatewayId,
    });

    if (existing) {
      await this.beaconRepository.save({
        ...existing,
        ...data,
        battery: data.battery ?? existing.battery,
      });
      return;
    }

    const created = this.beaconRepository.create(data);
    await this.beaconRepository.save(created);
  }
}
