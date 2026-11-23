/**
 * "Secure this reader" (ATT-1208): a paired plain reader moves over the network to the release secure profile.
 * States in protocol order; `failed`, `cancelled` and `secured` end a conversion, `interrupted` does not (the reader
 * may still come back and report).
 */
export const ATTRACTAP_CONVERSION_STATES = [
  'preflight',
  'transferring',
  'digests-burned',
  'bootloader-written',
  'encrypting',
  'migrating',
  'secured',
  'failed',
  'interrupted',
  'cancelled',
] as const;
export type AttractapConversionState = (typeof ATTRACTAP_CONVERSION_STATES)[number];

/** States that end a conversion. Every other state is active: at most one active conversion per installation. */
export const ATTRACTAP_CONVERSION_TERMINAL_STATES: readonly AttractapConversionState[] = [
  'secured',
  'failed',
  'cancelled',
];

/** States in which an administrator may still cancel: nothing has been burned yet. */
export const ATTRACTAP_CONVERSION_CANCELLABLE_STATES: readonly AttractapConversionState[] = [
  'preflight',
  'transferring',
];

/** Why a conversion failed. Closed set; each has an en/de message in the admin UI. */
export const ATTRACTAP_CONVERSION_FAILURES = [
  'preflight-failed',
  'transfer-failed',
  'verify-failed',
  'burn-refused',
  'digest-mismatch',
  'bootloader-write-failed',
  'migration-failed',
  'efuse-check-failed',
  'no-signing-key',
  'image-unavailable',
  'reader-changed',
  'protocol-error',
] as const;
export type AttractapConversionFailure = (typeof ATTRACTAP_CONVERSION_FAILURES)[number];

/** Why a reader cannot be secured right now. `not-hardware-tested` hides the action instead of disabling it. */
export const ATTRACTAP_CONVERSION_BLOCKERS = [
  'not-hardware-tested',
  'no-secure-image',
  'recovery-check-missing',
  'reader-unpaired',
  'reader-offline',
  'no-secure-conversion',
  'not-release-build',
  'demo-or-debug-variant',
  'not-plain-profile',
  'already-secured',
  'digests-differ',
  'conversion-running',
  // The caller may edit the reader but not secure it; no other gate is revealed then.
  'missing-permission',
] as const;
export type AttractapConversionBlocker = (typeof ATTRACTAP_CONVERSION_BLOCKERS)[number];

/** Preflight checks the server evaluates from the reader's raw (read-only) report. */
export const ATTRACTAP_PREFLIGHT_CHECKS = [
  'chip',
  'flash-size',
  'partition-table',
  'mac',
  'key-blocks',
  'secure-boot-off',
  'flash-encryption-off',
  'manual-encrypt',
  'heap',
  'variant',
  'profile',
] as const;
export type AttractapPreflightCheck = (typeof ATTRACTAP_PREFLIGHT_CHECKS)[number];

export interface AttractapPreflightCheckResult {
  check: AttractapPreflightCheck;
  ok: boolean;
  /** Short display value (e.g. "16 MB", "esp32s3 v0.2"); never secret. */
  value: string | null;
}

/** The images the reader is converted to, as signed for this installation. */
export interface AttractapConversionTarget {
  firmwareName: string;
  variant: string;
  version: string;
  secureVersion: number;
  appSha256: string;
  appSize: number;
  bootloaderSha256: string;
  bootloaderSize: number;
}

/** One conversion of one reader. History rows stay; only one row is active per installation. */
export interface AttractapSecureConversionRecord {
  id: number;
  readerId: number;
  state: AttractapConversionState;
  /** The state in which the conversion failed (with `failureReason`); decides whether a retry is safe. */
  failedInState: AttractapConversionState | null;
  failureReason: AttractapConversionFailure | null;
  target: AttractapConversionTarget;
  /** Secure Boot digests the conversion burns: KEY0 = signing key, KEY1 = recovery key. */
  digest0: string;
  digest1: string;
  preflight: AttractapPreflightCheckResult[] | null;
  /** The reader verified both staged images against `digest0`/`digest1`. */
  verified: boolean;
  bytesDone: number;
  bytesTotal: number;
  /** What the reader reported after the burn (read back from its eFuses). */
  burnReport: { mac: string; digest0: string; digest1: string } | null;
  actorId: number | null;
  startedAt: Date;
  stateChangedAt: Date;
  lastSeenAt: Date | null;
  endedAt: Date | null;
}

export type NewAttractapSecureConversion = Pick<
  AttractapSecureConversionRecord,
  'readerId' | 'target' | 'digest0' | 'digest1' | 'preflight' | 'actorId'
>;

export type AttractapSecureConversionPatch = Partial<
  Pick<
    AttractapSecureConversionRecord,
    | 'state'
    | 'failedInState'
    | 'failureReason'
    | 'preflight'
    | 'verified'
    | 'bytesDone'
    | 'bytesTotal'
    | 'burnReport'
    | 'lastSeenAt'
    | 'endedAt'
    | 'stateChangedAt'
  >
>;
