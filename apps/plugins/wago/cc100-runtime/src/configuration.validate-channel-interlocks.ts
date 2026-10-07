import { validateKeys } from './configuration.validate-keys';
import { type Snapshot, type ValidationError } from './runtime-types';

export function validateChannelInterlocks(
  channel: Snapshot['logicalChannels'][number],
  capabilities: Snapshot['logicalChannels'][number]['capabilities'],
  path: string,
  errors: ValidationError[],
  channelsById: Map<string, Snapshot['logicalChannels'][number]>,
): void {
  const guardChannel = channel.guard ? channelsById.get(channel.guard.channelId) : undefined;
  if (
    channel?.guard &&
    (!capabilities.includes('guard') ||
      !Array.isArray(guardChannel?.capabilities) ||
      !guardChannel.capabilities.includes('input') ||
      !['on', 'off'].includes(channel.guard.when) ||
      guardChannel.id === channel.id)
  ) {
    errors.push({
      path: `${path}.guard`,
      code: 'invalid_guard',
      message: 'guard requires guard capability, another input channel, and on/off condition',
    });
  }
  if (channel.guard) {
    validateKeys(channel.guard as Record<string, unknown>, `${path}.guard`, ['channelId', 'when'], errors);
  }
  const feedbackChannel = channel.feedback ? channelsById.get(channel.feedback.channelId) : undefined;
  if (
    channel.feedback &&
    (!capabilities.includes('feedback') ||
      !feedbackChannel ||
      feedbackChannel.id === channel.id ||
      !Array.isArray(feedbackChannel.capabilities) ||
      !feedbackChannel.capabilities.includes('input') ||
      !['match', 'inverse'].includes(channel.feedback.expected) ||
      !Number.isSafeInteger(channel.feedback.timeoutMs) ||
      channel.feedback.timeoutMs <= 0)
  ) {
    errors.push({
      path: `${path}.feedback`,
      code: 'invalid_feedback',
      message: 'feedback requires feedback capability, a channel, expectation, and positive timeout',
    });
  }
  if (channel.feedback) {
    validateKeys(
      channel.feedback as Record<string, unknown>,
      `${path}.feedback`,
      ['channelId', 'expected', 'timeoutMs'],
      errors,
    );
  }
}
