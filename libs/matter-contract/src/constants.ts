/** The one and only wire-protocol version. There is no previous-version support. */
export const WIRE_VERSION = 1;
/**
 * Version of the sidecar storage schema: the layout of the metadata file and of the matter.js storage the sidecar keeps in
 * `MATTER_SIDECAR_STORAGE_DIR`. A backup restores only onto a sidecar with the same version.
 */
export const STORAGE_SCHEMA_VERSION = 1;
/** Event envelope schema version. */
export const EVENT_SCHEMA_VERSION = 1;

export const MAX_MESSAGE_BYTES = 1024 * 1024;
/** Own body limit of the backup operations: snapshots exceed `MAX_MESSAGE_BYTES`. The general limit stays unchanged. */
export const MAX_BACKUP_BODY_BYTES = 64 * 1024 * 1024;
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
  'backup',
] as const;
export type FeatureFamily = (typeof FEATURE_FAMILIES)[number];
