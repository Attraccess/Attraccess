import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription, LiveTopic, liveSubscriptionKey } from '@attraccess/shared';
import { LiveTopicDefinition, LiveTopicProvider } from './live-topic-provider';

@Injectable()
export class LiveTopicsService {
  private readonly logger = new Logger(LiveTopicsService.name);
  private readonly providers = new Map<LiveTopic, { definition: LiveTopicDefinition; provider: LiveTopicProvider }>();

  register(provider: LiveTopicProvider): () => void {
    const topics = new Set<LiveTopic>();
    // Check the entire registration first, so a conflict cannot partially install a provider.
    for (const definition of provider.topics) {
      if (topics.has(definition.topic) || this.providers.has(definition.topic)) {
        throw new Error(`Live topic already registered: ${definition.topic}`);
      }
      topics.add(definition.topic);
    }
    for (const definition of provider.topics) this.providers.set(definition.topic, { definition, provider });
    return () => {
      for (const definition of provider.topics) {
        if (this.providers.get(definition.topic)?.provider === provider) this.providers.delete(definition.topic);
      }
    };
  }

  parse(value: unknown): LiveSubscription {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Invalid topic');
    const { topic, resourceId, identifier } = value as Record<string, unknown>;
    const registration = this.providers.get(topic as LiveTopic);
    if (!registration) throw new BadRequestException('Unsupported topic');
    const field = registration.definition.scope === 'plugin' ? 'identifier' : 'resourceId';
    if (Object.keys(value).some((key) => key !== 'topic' && key !== field)) {
      throw new BadRequestException('Unexpected topic fields');
    }
    if (registration.definition.scope === 'plugin') {
      const mode = registration.definition.identifier;
      if ((mode === 'none' && identifier !== undefined) || (mode === 'required' && identifier === undefined)) {
        throw new BadRequestException('Unexpected or missing plugin identifier');
      }
      if (
        identifier !== undefined &&
        (typeof identifier !== 'string' || !identifier.length || identifier.length > 128)
      ) {
        throw new BadRequestException('Invalid plugin identifier');
      }
      return { topic, ...(identifier !== undefined ? { identifier } : {}) } as LiveSubscription;
    }
    if (registration.definition.scope === 'resource') {
      if (typeof resourceId !== 'number' || !Number.isSafeInteger(resourceId) || resourceId <= 0) {
        throw new BadRequestException('Invalid resource identifier');
      }
      return { topic, resourceId } as LiveSubscription;
    }
    if (resourceId !== undefined) throw new BadRequestException('Unexpected resource identifier');
    return { topic } as LiveSubscription;
  }

  async authorize(
    subscriptions: Iterable<LiveSubscription>,
    user: AuthenticatedUser,
  ): Promise<ReadonlyMap<string, string>> {
    const groups = new Map<LiveTopicProvider, LiveSubscription[]>();
    for (const subscription of subscriptions) {
      const provider = this.providerFor(subscription);
      const group = groups.get(provider) ?? [];
      group.push(subscription);
      groups.set(provider, group);
    }
    const rejected = new Map<string, string>();
    for (const [provider, group] of groups) {
      try {
        const reasons = await provider.authorize?.(group, user);
        for (const subscription of group) {
          const key = liveSubscriptionKey(subscription);
          if (reasons?.has(key)) rejected.set(key, reasons.get(key));
        }
      } catch (error) {
        // An unavailable provider must not interrupt authorized topics from another feature.
        for (const subscription of group) rejected.set(liveSubscriptionKey(subscription), error.message);
      }
    }
    return rejected;
  }

  source(subscription: LiveSubscription, user: AuthenticatedUser) {
    return this.providerFor(subscription).source(subscription, user);
  }

  setPresence(subscription: LiveSubscription, userId: number, connectionId: string, present: boolean): void {
    try {
      this.providerFor(subscription).setPresence?.(subscription, userId, connectionId, present);
    } catch (error) {
      this.logger.error(`Live topic presence failed: ${subscription.topic}`, error);
    }
  }

  private providerFor(subscription: LiveSubscription): LiveTopicProvider {
    const registration = this.providers.get(subscription.topic);
    if (!registration) throw new BadRequestException('Unsupported topic');
    return registration.provider;
  }
}
