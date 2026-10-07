import { MqttServer } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttClient } from 'mqtt';
import { Repository } from 'typeorm';
import { EncryptionService } from '../encryption/encryption.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { MetricsService } from '../metrics/metrics.service';

export type SubscriptionQos = 0 | 1 | 2;

export interface TopicSubscription {
  qosCounts: Map<SubscriptionQos | undefined, number>;
  effectiveQos?: SubscriptionQos;
}

export abstract class MqttClientServiceRouteContext {
  protected abstract readonly connectionVersions: Map<number, number>;
  protected abstract readonly mqttServerRepository: Repository<MqttServer>;
  protected abstract resolveServerPassword(server: MqttServer): Promise<string | null>;
  protected abstract destroyed: boolean;
  protected abstract readonly logger: Logger;
  protected abstract readonly connectionCancellations: Map<number, Set<() => void>>;
  protected abstract readonly eventEmitter: EventEmitter2;
  protected abstract clients: Map<number, MqttClient>;
  protected abstract updateHealthyServerCount(): void;
  protected abstract subscriptions: Map<number, Map<string, TopicSubscription>>;
  protected abstract effectiveQos(subscription: TopicSubscription, defaultQos?: SubscriptionQos): SubscriptionQos;
  protected abstract reconcileSubscription(serverId: number, topic: string, connect: boolean): Promise<void>;
  protected abstract readonly metricsService: MetricsService;
  protected abstract readonly encryptionService: EncryptionService;
  protected abstract getOrCreateClient(serverId: number, keepTryingToConnect?: boolean): Promise<MqttClient>;
  protected abstract readonly externalCallTimer: ExternalCallTimer;
  protected abstract subscriptionOperations: Map<number, Map<string, Promise<void>>>;
}
