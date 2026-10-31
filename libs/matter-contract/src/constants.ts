/** The one and only wire-protocol version. There is no previous-version support. */
export const WIRE_VERSION = 1;
/** Version of the (not yet implemented) sidecar storage schema. Reporting it adds no persistence. */
export const STORAGE_SCHEMA_VERSION = 1;
/** Event envelope schema version. */
export const EVENT_SCHEMA_VERSION = 1;

export const MAX_MESSAGE_BYTES = 1024 * 1024;
export const DEFAULT_REQUEST_DEADLINE_MS = 10_000;
export const MAX_REQUEST_DEADLINE_MS = 60_000;
export const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;
export const DEFAULT_REPLAY_MAX_EVENTS = 1_000;
export const DEFAULT_REPLAY_MAX_AGE_MS = 5 * 60_000;

export const FEATURE_FAMILIES = [
  'health',
  'fabric',
  'commissioning',
  'inventory',
  'commands',
  'subscriptions',
  'thread',
  'ota',
] as const;
export type FeatureFamily = (typeof FEATURE_FAMILIES)[number];
