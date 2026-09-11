type ChannelBehavior = {
  capabilities: readonly string[];
  pulse?: { durationMs: number };
};

/** Preset names describe how a channel was created; its settings determine behavior. */
export function outputBehavior(channel: ChannelBehavior): 'switched' | 'pulsed' | null {
  if (!channel.capabilities.includes('output')) return null;
  // Treat inconsistent legacy pulse settings as pulsed too, so they cannot latch on.
  return channel.capabilities.includes('pulse') || channel.pulse !== undefined ? 'pulsed' : 'switched';
}

export function supportsOutputAction(channel: ChannelBehavior, action: 'set' | 'pulse'): boolean {
  const behavior = outputBehavior(channel);
  return behavior === 'switched'
    ? action === 'set'
    : behavior === 'pulsed' && action === 'pulse' && !pulseBehaviorError(channel.capabilities, channel.pulse);
}

/** Shared by API acceptance and persisted CC100 configuration validation. */
export function pulseBehaviorError(capabilities: readonly string[], pulse: unknown): string | undefined {
  if (!capabilities.includes('pulse') && pulse === undefined) return undefined;
  const duration =
    pulse && typeof pulse === 'object' && !Array.isArray(pulse)
      ? (pulse as { durationMs?: unknown }).durationMs
      : undefined;
  if (
    !capabilities.includes('output') ||
    !capabilities.includes('pulse') ||
    typeof duration !== 'number' ||
    !Number.isSafeInteger(duration) ||
    duration <= 0
  )
    return 'Pulsed behavior requires output and pulse capabilities and a positive integer durationMs.';
  return undefined;
}
