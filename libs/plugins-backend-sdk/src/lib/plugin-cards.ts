/**
 * Card authentication over a plugin's own NFC device (permission `CARD_AUTHENTICATION`).
 *
 * A plugin that owns an NFC-capable device hands the host the UID of the card held to it and a card channel: a
 * function that relays one APDU to the card and returns the card's answer. The host runs the same check as a tap
 * on an Attractap reader over that channel: it detects the card type and authenticates the card with the key
 * stored for its UID. Card keys, session keys and secure messaging never leave the host; the plugin only relays
 * bytes and receives the card's id, UID and owner, or a failure reason.
 */

/** Stable failure reasons. Never renamed or removed. */
export const PluginCardFailureReason = {
  /** The server is at its limit of concurrent card conversations (readers and plugins together). Retry later. */
  BUSY: 'BUSY',
  /** The plugin aborted `signal`, or a newer `authenticate` for the same device took over. */
  CARD_REMOVED: 'CARD_REMOVED',
  /** One exchange took longer than 3 s, or the whole conversation longer than 15 s. */
  TIMEOUT: 'TIMEOUT',
  /** The conversation needed more than 32 exchanges. */
  TOO_MANY_EXCHANGES: 'TOO_MANY_EXCHANGES',
  /** `exchange` rejected, or resolved with something that is not a `Uint8Array` or is longer than 64 bytes. */
  DEVICE_ERROR: 'DEVICE_ERROR',
  /** The host is shutting down, or the plugin is being disabled, uninstalled or restarted. */
  CANCELLED: 'CANCELLED',
  /** The UID is not 2 to 16 bytes of hex. */
  INVALID_UID: 'INVALID_UID',
  /** No card is enrolled for this UID. */
  CARD_NOT_FOUND: 'CARD_NOT_FOUND',
  /** The card is enrolled but not active. */
  CARD_NOT_ACTIVE: 'CARD_NOT_ACTIVE',
  /** The card type is not supported (for example a DESFire EV1). */
  CARD_NOT_SUPPORTED: 'CARD_NOT_SUPPORTED',
  /** The card did not prove the key stored for its UID (a copied UID, a foreign card, a tampered answer). */
  CARD_AUTHENTICATION_FAILED: 'CARD_AUTHENTICATION_FAILED',
} as const;
export type PluginCardFailureReason = (typeof PluginCardFailureReason)[keyof typeof PluginCardFailureReason];

/** Host caps of one card conversation. They are the same as for Attractap readers. */
export const PLUGIN_CARD_LIMITS = {
  exchangeTimeoutMs: 3_000,
  conversationTimeoutMs: 15_000,
  maxExchanges: 32,
  /** Longest card answer, status bytes included. */
  maxResponseBytes: 64,
  /** Longest APDU the host sends. */
  maxCommandBytes: 62,
} as const;

/** The plugin's link to the card held to its device. */
export interface PluginCardChannel {
  /**
   * Relay one complete APDU to the card and resolve with the card's full answer, status bytes included. The host
   * sends one APDU at a time. `signal` is aborted when the host no longer waits for the answer (timeout, abort,
   * end of the conversation); stop relaying then. A late answer is ignored.
   */
  exchange(apdu: Uint8Array, options: { signal: AbortSignal }): Promise<Uint8Array>;
}

export interface PluginCardAuthenticationRequest {
  /** Card UID as reported by the device, hex (4 to 32 characters). */
  uid: string;
  /**
   * Plugin-chosen id of the device that holds the card. One conversation runs per plugin and device: a new
   * `authenticate` for the same device ends the running one with `CARD_REMOVED`.
   */
  device: string;
  channel: PluginCardChannel;
  /** Abort it when the card left the field or the plugin gives up: the conversation ends with `CARD_REMOVED`. */
  signal?: AbortSignal;
}

/** The authenticated card. It never carries key material. */
export interface PluginAuthenticatedCard {
  id: number;
  uid: string;
  /** Owner of the card. Access decisions stay with the plugin (for example through `context.resourceAccess`). */
  userId: number;
}

export type PluginCardAuthenticationResult =
  { ok: true; card: PluginAuthenticatedCard } | { ok: false; reason: PluginCardFailureReason };

/** `context.cards`. Requires the `CARD_AUTHENTICATION` permission. */
export interface PluginCardsContext {
  /**
   * Authenticates the card held to the plugin's device over its channel. Resolves for every card or conversation
   * outcome; rejects only for programming errors, such as a missing `channel.exchange` or an empty `device`.
   */
  authenticate(request: PluginCardAuthenticationRequest): Promise<PluginCardAuthenticationResult>;
}
