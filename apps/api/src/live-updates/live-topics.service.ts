import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription, LiveTopic, liveSubscriptionKey } from '@attraccess/shared';
import { LiveTopicProvider } from './live-topic-provider';
import { LiveTopicSchema, liveSubscriptionSchema } from './live-updates.schemas';

/** Only validation performed here supplies approved public exception text. */
export class LiveTopicValidationException extends BadRequestException {
  constructor(readonly reason: 'Invalid topic' | 'Unsupported topic') {
    super(reason);
  }
}

@Injectable()
export class LiveTopicsService {
  private readonly logger = new Logger(LiveTopicsService.name);
  private readonly providers = new Map<
    string,
    { schema: ReturnType<typeof liveSubscriptionSchema>; provider: LiveTopicProvider }
  >();

  register(provider: LiveTopicProvider): () => void {
    const topics = new Set<LiveTopic>();
    // Check the entire registration first, so a conflict cannot partially install a provider.
    for (const definition of provider.topics) {
      if (topics.has(definition.topic) || this.providers.has(definition.topic)) {
        throw new Error(`Live topic already registered: ${definition.topic}`);
      }
      topics.add(definition.topic);
    }
    for (const definition of provider.topics) {
      this.providers.set(definition.topic, { schema: liveSubscriptionSchema(definition), provider });
    }
    return () => {
      for (const definition of provider.topics) {
        if (this.providers.get(definition.topic)?.provider === provider) this.providers.delete(definition.topic);
      }
    };
  }

  parse(value: unknown): LiveSubscription {
    const topic = LiveTopicSchema.safeParse(value);
    if (!topic.success) throw new LiveTopicValidationException('Invalid topic');
    const registration = this.providers.get(topic.data.topic);
    if (!registration) throw new LiveTopicValidationException('Unsupported topic');
    const subscription = registration.schema.safeParse(value);
    if (!subscription.success) throw new LiveTopicValidationException('Invalid topic');
    return subscription.data;
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
      } catch {
        // An unavailable provider must not interrupt authorized topics from another feature.
        for (const subscription of group) rejected.set(liveSubscriptionKey(subscription), 'Topic unavailable');
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
