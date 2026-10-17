import { z } from 'zod';
import { LiveSubscription } from '@attraccess/shared';
import { LiveTopicDefinition } from './live-topic-provider';

// Keep the existing UUID-shaped identifier contract; clients generate UUIDs themselves.
export const LiveConnectionIdSchema = z.guid();

export const LiveSubscriptionSetSchema = z.object({
  revision: z.int().nonnegative(),
  subscriptions: z.array(z.unknown()).max(256),
  present: z.boolean().optional(),
});

export const LiveTopicSchema = z.object({ topic: z.string() });

const pluginIdentifier = z.string().min(1).max(128);

export function liveSubscriptionSchema(definition: LiveTopicDefinition): z.ZodType<LiveSubscription> {
  switch (definition.scope) {
    case 'resource':
      return z.strictObject({ topic: z.literal(definition.topic), resourceId: z.int().positive() });
    case 'plugin':
      return z
        .strictObject({
          topic: z.literal(definition.topic),
          identifier:
            definition.identifier === 'none'
              ? z.undefined().optional()
              : definition.identifier === 'required'
                ? pluginIdentifier
                : pluginIdentifier.optional(),
        })
        .transform(({ topic, identifier }) => ({ topic, ...(identifier !== undefined ? { identifier } : {}) }));
    case 'user':
      return z
        .strictObject({ topic: z.literal(definition.topic), resourceId: z.undefined().optional() })
        .transform(({ topic }) => ({ topic }));
  }
}
