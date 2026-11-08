import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription, liveSubscriptionKey } from '@attraccess/shared';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { LiveTopicProvider } from '../../live-updates/live-topic-provider';
import { LiveTopicsService } from '../../live-updates/live-topics.service';
import {
  MAX_FILTER_BYTES,
  MQTT_EXPLORER_LIVE_TOPIC,
  MQTT_EXPLORER_PERMISSION,
  validateTopicFilter,
} from './mqtt-explorer.constants';
import { MqttExplorerService } from './mqtt-explorer.service';

type ExplorerSubscription = Extract<LiveSubscription, { topic: 'mqtt-messages' }>;

@Injectable()
export class MqttExplorerLiveTopicsProvider implements LiveTopicProvider, OnModuleInit {
  readonly topics = [
    { topic: MQTT_EXPLORER_LIVE_TOPIC, scope: 'mqtt-explorer', maxFilterBytes: MAX_FILTER_BYTES },
  ] as const;

  constructor(
    private readonly registry: LiveTopicsService,
    private readonly explorer: MqttExplorerService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  /** Re-checked on every renewal: identity always comes from the session. */
  async authorize(subscriptions: readonly LiveSubscription[], user: AuthenticatedUser) {
    const rejected = new Map<string, string>();
    const allowed = user.effectivePermissions?.has(MQTT_EXPLORER_PERMISSION) === true;
    for (const subscription of subscriptions as readonly ExplorerSubscription[]) {
      const key = liveSubscriptionKey(subscription);
      if (!allowed) rejected.set(key, 'Forbidden');
      else if (!validateTopicFilter(subscription.filter)) rejected.set(key, 'Invalid topic filter');
      else if (!(await this.explorer.findServer(subscription.mqttServerId))) rejected.set(key, 'Not found');
    }
    return rejected;
  }

  async source(subscription: LiveSubscription, user: AuthenticatedUser) {
    const { mqttServerId, filter } = subscription as ExplorerSubscription;
    return this.explorer.subscribe(user, mqttServerId, filter);
  }
}
