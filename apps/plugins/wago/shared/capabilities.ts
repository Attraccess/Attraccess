/**
 * The runtime caps and counts what it receives and reports its drop counters in heartbeats. The server
 * only reads those fields from a controller that advertises this, so older runtimes keep working.
 */
export const BOUNDED_MESSAGES_CAPABILITY = 'bounded-messages-v1';

/** Reasons a runtime drops a message without answering, as reported in heartbeat `dropCounts`. */
export const DROP_REASONS = ['oversized', 'overload'] as const;
export type DropReason = (typeof DROP_REASONS)[number];

/**
 * The runtime understands `logicalChannels[].enabled: false` and neither polls, publishes nor counts a
 * disabled channel. An older runtime rejects the whole configuration with `unknown_field` for `enabled`,
 * so the server only sends disabled channels to a controller that advertises this. A controller without
 * it also still enforces the older, lower configuration limits.
 */
export const CHANNEL_ENABLED_CAPABILITY = 'channel-enabled-v1';
